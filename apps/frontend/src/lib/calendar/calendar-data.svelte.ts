import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { addDays, DAYS_PER_WEEK, MINUTES_PER_DAY, startOfDay, startOfWeek, weekKey } from "$lib/dates";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  removeEventMapping,
  saveEventMapping,
  updateCalendarEvent,
} from "$lib/queries";
import { calendarWeek, invalidate, store } from "$lib/store.svelte";
import type { Activity, ActivityWeight, CalendarEvent, MappingScope } from "$lib/types";
import type { HistoryStep } from "./history.svelte";
import { CalendarHistory } from "./history.svelte";
import { DEFAULT_EVENT_MINUTES, segmentsForRange, SNAP_MINUTES, snapMinutes } from "./week-grid";

/** Three weeks of columns, so there's a week to scroll into on either side of the seven shown. */
export const STRIP_DAYS = 3 * DAYS_PER_WEEK;

/** How far a finger has to travel before a tap becomes a drag, and how long before a hold does. */
const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 350;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 12;

/** How many events keep a handle before the lot is dropped — see `#ref`. */
const REF_LIMIT = 200;

/** How many times a write asks the calendar to agree with it before taking no for an answer. */
const SETTLE_ATTEMPTS = 3;
const SETTLE_DELAY_MS = 600;
/** The id a block wears between being drawn and the calendar giving it a real one. */
const DRAFT_PREFIX = "draft:";

/** How close together, in time and on screen, two taps on empty grid have to be to count as one. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 24;

export type DragKind = "create" | "move" | "resize" | "resize-start";

/** What a write draws on the grid before the server has confirmed it — `null` being "gone". */
interface Drawn {
  readonly id: string;
  readonly event: CalendarEvent | null;
}

/**
 * A handle on one event across the writes that touch it. Undoing a delete makes a new event with
 * a new id, and the steps recorded before that have to keep pointing at the same block.
 */
interface EventRef {
  id: string;
  calendarId: string;
}

/** Everything the editor and a drag can change about an event, in the shape a write takes. */
interface EventFields {
  readonly title: string;
  readonly description: string | null;
  readonly start: Date;
  readonly end: Date;
}

/** What an event counts as, in the shape the mapping endpoints take. */
interface Mapping {
  readonly scope: MappingScope;
  readonly choice: { activityId?: string; weights?: ActivityWeight[] };
}

export interface DragState {
  readonly kind: DragKind;
  readonly title: string;
  readonly weights: ActivityWeight[];
  readonly activityId: string | null;
  readonly event: CalendarEvent | null;
  /** Alt held right now: dropping makes a duplicate instead of moving the original. Live — toggles mid-drag. */
  copy: boolean;
  /**
   * The rest of the gathered blocks, dragged along by the same distance as the one under the
   * finger — empty for an ordinary drag.
   */
  readonly others: readonly CalendarEvent[];
  /** The day the block starts on, as a date: the strip runs across weeks, so an index won't do. */
  day: Date;
  /**
   * Minutes from the start of `day`, which either edge may leave: dragging an end past midnight
   * puts it above 1440, and dragging a start back before midnight takes it negative. That's what
   * makes an evening-to-morning block — a night's sleep — something a drag can express.
   */
  startMinutes: number;
  endMinutes: number;
  /**
   * Where the block itself follows the pointer, unsnapped — `startMinutes`/`endMinutes` stay on
   * the 15-minute grid so the drop target rectangle can show where a release will land.
   */
  freeStartMinutes: number;
  freeEndMinutes: number;
  /** The block's horizontal position, continuous in day units from `stripStart` — see `freeStartMinutes`. */
  freeDayIndex: number;
}

/**
 * A rectangle being drawn over empty grid, in the grid's own units: a continuous day index across
 * the strip, and minutes into the day. Both corners are where the pointer was, unsnapped.
 */
export interface MarqueeState {
  readonly fromDay: number;
  readonly fromMinutes: number;
  toDay: number;
  toMinutes: number;
}

/** Where a move drag currently puts a block: its column, snapped and unsnapped — see `#pointerToSlot`. */
interface DragSlot {
  readonly day: Date;
  readonly index: number;
  readonly minutes: number;
  readonly rawMinutes: number;
  readonly rawIndex: number;
}

interface PendingDrag {
  readonly kind: DragKind;
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  readonly activity: Activity | null;
  readonly event: CalendarEvent | null;
  /** An event someone else owns: it still opens on a tap, it just can't be dragged anywhere. */
  readonly locked: boolean;
  /** Alt held on the way in — see `DragState.copy`. */
  readonly copy: boolean;
  /** The element the press started on, and the one a started drag captures the pointer to. */
  readonly el: Element;
  timer: ReturnType<typeof setTimeout> | null;
  armed: boolean;
}

/**
 * The calendar screen's state: which week is on show, what's being dragged, and the writes that
 * follow. A module-level singleton like every other screen's data — switching tabs keeps the week
 * you were looking at.
 */
class CalendarData {
  /** Opens on the current week; scrolling moves it off a Monday and that's fine. */
  anchor = $state(startOfWeek(new Date()));
  /**
   * The open event, by id rather than by value: a write replaces every event object, and the
   * editor has to show what the week now holds — a category set from inside it lands on the row
   * that set it, not one refetch later.
   */
  selectedId = $state<string | null>(null);
  /** Where the tapped block is on screen, so its editor can open beside it rather than over it. */
  selectedRect = $state<DOMRect | null>(null);
  /** The block made a moment ago and still unnamed: its editor opens with the cursor in the name. */
  unnamedId = $state<string | null>(null);
  /** The block a right-click landed on, and where — null when no context menu is open. */
  contextMenuEvent = $state<CalendarEvent | null>(null);
  contextMenuRect = $state<DOMRect | null>(null);
  actionError = $state<string | null>(null);
  drag = $state<DragState | null>(null);
  /**
   * Times the editor is entering right now, drawn on the grid before anything is written: typing a
   * new end, or walking the suggested ones, moves the block while it's being decided.
   */
  preview = $state<{ id: string; start: string; end: string } | null>(null);
  /**
   * The blocks gathered for a write that applies to all of them — by dragging a box over empty
   * grid, or by ⌘-clicking them one at a time. Ids rather than events: a refetch replaces every
   * event object, and a selection has to survive that.
   */
  readonly picked = new SvelteSet<string>();
  /** The box being dragged over empty grid right now, if any. */
  marquee = $state<MarqueeState | null>(null);
  /** The writes ⌘Z can take back — every editing method records one. */
  readonly history = new CalendarHistory();

  /** The whole 21-day strip, registered by the grid so the palette can hit-test against it. */
  columnsEl = $state<HTMLElement | undefined>(undefined);
  scrollerEl = $state<HTMLElement | undefined>(undefined);

  /**
   * What a write has already done to the grid, before the server has agreed to it. Letting go of
   * a block has to leave it where it was let go — a round trip to Google is most of a second, and
   * for that whole second the old version is a lie the app is telling about work already done.
   *
   * A `null` is an event deleted. Entries live until the refetch that replaces them lands, so the
   * block never blinks back to where it came from, and a write that failed is undone by the
   * server's own answer rather than by remembering what to put back.
   */
  readonly #pending = new SvelteMap<string, CalendarEvent | null>();
  /** Ids for events that don't have one yet — see `#create`. */
  #nextTempId = 0;
  /** One handle per event the history still has a step for — see `#ref`. */
  readonly #refs = new Map<string, EventRef>();
  /** The writes waiting their turn at the server — see `#run`. */
  #queue: Promise<unknown> = Promise.resolve();
  /**
   * Which write each drawn-ahead block belongs to. Editing the same event twice in a row leaves
   * the first write holding a version of it nobody wants any more: without this, that write's
   * refetch would take the second one's block off the grid and put its own back for a second.
   */
  readonly #drawnBy = new Map<string, symbol>();
  /**
   * What each draft turned into, so a card open on a block the calendar has only just made knows
   * it's still the same block rather than a different event that happened to appear.
   */
  readonly #became = new Map<string, string>();
  /**
   * Edits made to a block while it was still a draft. There's nothing to write them against until
   * the calendar answers, so they're kept and sent as one write the moment it does.
   */
  readonly #draftEdits = new Map<string, EventFields>();

  #pendingDrag: PendingDrag | null = null;
  /** What was gathered before the current box started, so shrinking it back doesn't drop them. */
  #pickedBeforeMarquee = new Set<string>();
  /** Minutes between the pointer and the moved block's top at grab time — see `#start`. */
  #grabOffsetMinutes = 0;
  /** Same as `#grabOffsetMinutes`, but for the block's day column, in day units. */
  #grabOffsetDays = 0;
  /** Whether the press that's ending actually moved something, so its click isn't read as a tap. */
  #dragged = false;
  #autoscroll: number | null = null;
  /** Where the press on empty grid landed, so a release that travelled isn't read as a tap. */
  #pressAt: { x: number; y: number } | null = null;
  /** The last tap on empty grid, which the next one is measured against — see `tapEmpty`. */
  #lastTap: { x: number; y: number; at: number } | null = null;

  /** The first of the seven days on screen — any day, not just a Monday. */
  readonly windowStart = $derived(startOfDay(this.anchor));

  /**
   * The grid draws three whole weeks and shows seven days of them, so there's always a week
   * either side to scroll into and the day columns line up with the week the events came in.
   */
  readonly stripStart = $derived(addDays(startOfWeek(this.windowStart), -DAYS_PER_WEEK));
  readonly dayOffset = $derived(daysBetween(this.stripStart, this.windowStart));
  readonly weeks = $derived(
    [0, DAYS_PER_WEEK, 2 * DAYS_PER_WEEK].map((day) => calendarWeek(weekKey(addDays(this.stripStart, day)))),
  );

  /**
   * One copy of each event — the ones that straddle Sunday night come back in two weeks'
   * answers — with anything the finger has already done laid over the top.
   *
   * Filtered by which calendars are shown, client-side: the server filters the same way, but
   * that answer is a round trip behind, and the sidebar toggle has to feel instant.
   */
  readonly events = $derived.by(() => {
    const byId = new Map(this.weeks.flatMap((week) => week.value?.events ?? []).map((event) => [event.id, event]));
    for (const [id, event] of this.#pending) {
      if (event) byId.set(id, event);
      else byId.delete(id);
    }
    // Times the editor is showing but hasn't written yet, so a block on the grid answers the
    // typing that will move it — the same thing a resize drag does, without the finger.
    const preview = this.preview;
    const previewed = preview && byId.get(preview.id);
    if (preview && previewed) byId.set(preview.id, { ...previewed, start: preview.start, end: preview.end });
    const prefs = store.calendars.value;
    if (!prefs) return [...byId.values()];
    const primaryIds = new Set(prefs.calendars.filter((c) => c.primary).map((c) => c.id));
    const shownIds = prefs.visibleCalendarIds.length === 0 ? primaryIds : new Set(prefs.visibleCalendarIds);
    return [...byId.values()].filter((event) => shownIds.has(event.calendarId));
  });

  /**
   * Seven days always overlap two calendar weeks; the one holding four or more of them is the
   * week the meters and the title are about. Adding three days lands on that week by itself.
   */
  readonly weekStart = $derived(startOfWeek(addDays(this.windowStart, 3)));
  readonly key = $derived(weekKey(this.weekStart));
  readonly week = $derived(calendarWeek(this.key));

  /** Whether there's a grid to draw at all — a week still loading must not unmount the one on show. */
  readonly ready = $derived(this.weeks.some((week) => week.hasValue));
  readonly connected = $derived(this.week.value?.connected ?? store.integrations.value?.[0]?.connected ?? false);
  readonly needsReconnect = $derived(this.week.value?.needsReconnect ?? false);
  readonly isThisWeek = $derived(this.key === weekKey(new Date()));

  /** "August 2026", or "Jul – Aug 2026" for the weeks that straddle two. */
  readonly monthLabel = $derived.by(() => {
    const end = addDays(this.weekStart, DAYS_PER_WEEK - 1);
    const year = end.getFullYear();
    if (this.weekStart.getMonth() === end.getMonth()) {
      return `${end.toLocaleDateString(undefined, { month: "long" })} ${year}`;
    }
    const from = this.weekStart.toLocaleDateString(undefined, { month: "short" });
    const to = end.toLocaleDateString(undefined, { month: "short" });
    return `${from} – ${to} ${year}`;
  });

  /** The gathered blocks themselves, as the week currently holds them. */
  readonly pickedEvents = $derived(this.events.filter((event) => this.picked.has(event.id)));

  /** The open event as the week currently holds it, or null once it's gone from the week. */
  readonly selected = $derived.by(() => {
    const id = this.selectedId;
    if (!id) return null;
    const open = this.events.find((event) => event.id === id);
    if (open) return open;
    // A draft comes off the grid the moment the calendar's own version of it arrives. That's the
    // same block, so the card stays on it rather than closing and opening again.
    const became = this.#became.get(id);
    return (became && this.events.find((event) => event.id === became)) || null;
  });

  select(event: CalendarEvent, rect: DOMRect | null) {
    // Opening any other block ends the naming of the one made a moment ago.
    if (this.unnamedId !== event.id) this.unnamedId = null;
    this.selectedId = event.id;
    this.selectedRect = rect;
  }

  /**
   * A block's own click, which arrives on whatever captured the pointer rather than on the button
   * inside it — hence a tap being answered here and not by the block. A press that turned into a
   * real drag still ends in a click, and that one isn't a tap.
   *
   * ⌘-click adds the block to the gathered ones instead of opening it: a batch is built by
   * clicking, so a click can't also be what takes the batch apart.
   */
  tap(event: CalendarEvent, rect: DOMRect, additive = false) {
    if (this.#dragged) return;
    if (additive) return this.togglePicked(event);
    // Tapping a block that's part of an already-gathered batch opens it for editing without
    // scattering the rest — a category chosen there is meant to land on the whole batch.
    if (!this.picked.has(event.id)) this.clearPicked();
    this.select(event, rect);
  }

  deselect() {
    this.selectedId = null;
    this.selectedRect = null;
    this.unnamedId = null;
  }

  /**
   * A right-click on a block. Left over the gathered blocks it opens for the batch; otherwise it
   * opens for that block alone, and doesn't disturb whatever's already gathered or selected.
   */
  openContextMenu(event: CalendarEvent, at: { clientX: number; clientY: number }) {
    this.contextMenuEvent = event;
    this.contextMenuRect = new DOMRect(at.clientX, at.clientY, 0, 0);
  }

  closeContextMenu() {
    this.contextMenuEvent = null;
    this.contextMenuRect = null;
  }

  // --- gathering many blocks -------------------------------------------------

  /**
   * ⌘-click on a block. An open editor is a selection of one, so the block it was showing joins
   * the batch rather than being dropped — ⌘-clicking a second block gathers both.
   */
  togglePicked(event: CalendarEvent) {
    const open = this.selectedId;
    this.deselect();
    if (open && open !== event.id) this.picked.add(open);
    if (!this.picked.delete(event.id)) this.picked.add(event.id);
  }

  clearPicked() {
    this.picked.clear();
  }

  /**
   * A box dragged over empty grid gathers what it touches. Only where there's nothing already —
   * over a block the same press moves it — and only with a mouse: a finger dragging the grid is
   * scrolling it, which is how the week changes.
   */
  beginMarquee(e: PointerEvent) {
    // Every press on the grid is measured, mouse or finger: it's what tells a tap from a drag.
    this.#pressAt = { x: e.clientX, y: e.clientY };
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as Element | null)?.closest("[data-event]")) return;
    const at = this.#pointerToPoint(e);
    if (!at) return;

    e.preventDefault();
    this.deselect();
    if (!e.shiftKey) this.clearPicked();
    this.#pickedBeforeMarquee = new Set(this.picked);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    this.marquee = { fromDay: at.dayIndex, fromMinutes: at.minutes, toDay: at.dayIndex, toMinutes: at.minutes };
  }

  moveMarquee(e: PointerEvent) {
    const marquee = this.marquee;
    if (!marquee) return;
    const at = this.#pointerToPoint(e);
    if (!at) return;
    marquee.toDay = at.dayIndex;
    marquee.toMinutes = at.minutes;
    this.#gather(marquee);
  }

  endMarquee() {
    this.marquee = null;
  }

  /**
   * Two quick taps on empty grid make an hour there and open it — the way onto the week that
   * doesn't start at the palette. A press that travelled was a drag or a scroll of the week, and
   * one that landed on a block belongs to that block.
   */
  tapEmpty(e: PointerEvent) {
    const press = this.#pressAt;
    this.#pressAt = null;
    if (!press || this.drag || !this.connected) return;
    if ((e.target as Element | null)?.closest("[data-event]")) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) >= DRAG_THRESHOLD_PX) return;

    const last = this.#lastTap;
    const at = Date.now();
    this.#lastTap = { x: e.clientX, y: e.clientY, at };
    if (!last || at - last.at > DOUBLE_TAP_MS) return;
    if (Math.hypot(e.clientX - last.x, e.clientY - last.y) >= DOUBLE_TAP_PX) return;

    this.#lastTap = null;
    void this.#createAt(e);
  }

  /** An hour at the tapped slot, opened beside the pointer as soon as it has an id to be named by. */
  #createAt(e: PointerEvent) {
    const at = this.#pointerToPoint(e);
    if (!at) return;
    const day = addDays(this.stripStart, clamp(Math.floor(at.dayIndex), 0, STRIP_DAYS - 1));
    const minutes = clamp(snapMinutes(at.minutes), 0, MINUTES_PER_DAY - DEFAULT_EVENT_MINUTES);

    this.deselect();
    this.clearPicked();
    // Untitled: the editor opens on it with the cursor in the name, which is where the name comes
    // from — a placeholder would only be something to delete first.
    return this.#create(
      null,
      "",
      this.#instantAt(day, minutes),
      this.#instantAt(day, minutes + DEFAULT_EVENT_MINUTES),
      new DOMRect(e.clientX, e.clientY, 0, 0),
    );
  }

  /** Every block the box overlaps, in the grid's own coordinates rather than the screen's. */
  #gather(marquee: MarqueeState) {
    const fromDay = Math.min(marquee.fromDay, marquee.toDay);
    const toDay = Math.max(marquee.fromDay, marquee.toDay);
    const fromMinutes = Math.min(marquee.fromMinutes, marquee.toMinutes);
    const toMinutes = Math.max(marquee.fromMinutes, marquee.toMinutes);

    const hit = new Set<string>();
    for (const segment of segmentsForRange(this.events, this.stripStart, STRIP_DAYS)) {
      const overlapsDay = segment.dayIndex + 1 > fromDay && segment.dayIndex < toDay;
      const overlapsTime = segment.endMinutes > fromMinutes && segment.startMinutes < toMinutes;
      if (overlapsDay && overlapsTime) hit.add(segment.event.id);
    }
    // Shift-dragging adds to what was already gathered; a plain drag cleared it on the way in.
    for (const id of hit) this.picked.add(id);
    for (const id of [...this.picked]) if (!hit.has(id) && !this.#pickedBeforeMarquee.has(id)) this.picked.delete(id);
  }

  enter() {
    return Promise.all([
      store.categories.ensure(),
      store.activities.ensure(),
      store.integrations.ensure(),
      this.ensureWeeks(),
    ]);
  }

  ensureWeeks() {
    return Promise.all(this.weeks.map((week) => week.ensure()));
  }

  refreshWeeks() {
    return Promise.all(this.weeks.map((week) => week.refresh()));
  }

  /** Scrolling sideways moves the window a day at a time. */
  goToDay(shift: number) {
    this.anchor = addDays(this.windowStart, shift);
    void this.ensureWeeks();
  }

  goToToday() {
    this.anchor = startOfWeek(new Date());
    void this.ensureWeeks();
  }

  // --- dragging -------------------------------------------------------------

  /** A palette chip: a tap opens the activity, so the drag only starts once the finger moves. */
  beginCreate(activity: Activity, e: PointerEvent) {
    this.#arm({ kind: "create", activity, event: null, e, armed: false });
  }

  /** A block: a tap opens its editor, so moving it takes a hold rather than a nudge. */
  beginMove(event: CalendarEvent, e: PointerEvent) {
    // The category badge can sit under the resize band on a short block — its own handlers
    // stop propagation, but that only helps if the press actually reaches the button.
    if ((e.target as Element | null)?.closest("[data-category-badge]")) return;
    // A ⌘-click is gathering blocks, not moving one — the click that follows does the gathering.
    if (e.metaKey || e.ctrlKey) {
      this.#dragged = false;
      return;
    }
    this.#arm({
      kind: "move",
      activity: null,
      event,
      e,
      armed: false,
      longPress: !event.readOnly,
      locked: event.readOnly,
      copy: e.altKey,
    });
  }

  beginResize(event: CalendarEvent, e: PointerEvent) {
    if (event.readOnly) return;
    if ((e.target as Element | null)?.closest("[data-category-badge]")) return;
    e.stopPropagation();
    this.#arm({ kind: "resize", activity: null, event, e, armed: true });
  }

  /** Same handle as `beginResize`, dragging the top edge — the end stays put, the start follows. */
  beginResizeStart(event: CalendarEvent, e: PointerEvent) {
    if (event.readOnly) return;
    if ((e.target as Element | null)?.closest("[data-category-badge]")) return;
    e.stopPropagation();
    this.#arm({ kind: "resize-start", activity: null, event, e, armed: true });
  }

  moveDrag(e: PointerEvent) {
    const pending = this.#pendingDrag;
    if (pending && !pending.armed) {
      const travelled = Math.hypot(e.clientX - pending.originX, e.clientY - pending.originY);
      if (travelled < DRAG_THRESHOLD_PX) return;
      this.#start(pending);
    }
    if (!this.drag) return;

    const at = this.#pointerToSlot(e);
    if (!at) return;
    this.#autoscrollNear(e.clientY);
    if (this.drag.kind === "move") this.drag.copy = e.altKey;

    // An edge follows the pointer into whatever column it's over, counted from the block's own
    // start day, so dragging sideways as well as down grows the block across midnight.
    if (this.drag.kind === "resize" || this.drag.kind === "resize-start") {
      const edge = this.#pointerToEdge(e, this.drag.day);
      if (!edge) return;
      if (this.drag.kind === "resize") {
        this.drag.endMinutes = Math.max(this.drag.startMinutes + SNAP_MINUTES, edge.minutes);
        this.drag.freeEndMinutes = Math.max(this.drag.startMinutes + SNAP_MINUTES, edge.rawMinutes);
      } else {
        this.drag.startMinutes = Math.min(this.drag.endMinutes - SNAP_MINUTES, edge.minutes);
        this.drag.freeStartMinutes = Math.min(this.drag.endMinutes - SNAP_MINUTES, edge.rawMinutes);
      }
      return;
    }
    // A move keeps its length, however many days that is. The block hangs off the column it's over
    // rather than being tucked back inside it, so dragging it through midnight — off the foot of
    // one day and into the head of the next — moves it a day just as dragging sideways does.
    const length = this.drag.endMinutes - this.drag.startMinutes;
    this.drag.day = at.day;
    this.drag.startMinutes = this.#insideStrip(at.index, at.minutes, at.index, length);
    this.drag.endMinutes = this.drag.startMinutes + length;
    this.drag.freeStartMinutes = this.#insideStrip(at.index, at.rawMinutes, at.index, length);
    this.drag.freeEndMinutes = this.drag.freeStartMinutes + length;
    this.drag.freeDayIndex = at.rawIndex;
  }

  /** Alt pressed or released mid-drag, ahead of the next pointer move — see `moveDrag`. */
  setDragCopy(copy: boolean) {
    if (this.drag?.kind === "move") this.drag.copy = copy;
  }

  endDrag() {
    this.#cancelPending();
    this.#stopAutoscroll();
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;

    const start = this.#instantAt(drag.day, drag.startMinutes);
    const end = this.#instantAt(drag.day, drag.endMinutes);

    if (drag.kind === "create" && drag.activityId) void this.#create(drag.activityId, drag.title, start, end);
    else if (drag.event && drag.copy) void this.#copyBatch(drag, start, end);
    else if (drag.event && drag.others.length > 0) void this.#retimeBatch(drag, start, end);
    else if (drag.event) void this.retimeEvent(drag.event, start, end);
  }

  /** Alt-drag: every gathered block is duplicated at the drop position, the originals untouched. */
  #copyBatch(drag: DragState, start: Date, end: Date) {
    const was = drag.event;
    if (!was) return;
    const shiftStart = start.getTime() - new Date(was.start).getTime();
    const shiftEnd = end.getTime() - new Date(was.end).getTime();
    return Promise.all(
      [
        { event: was, start, end },
        ...drag.others.map((event) => ({
          event,
          start: new Date(new Date(event.start).getTime() + shiftStart),
          end: new Date(new Date(event.end).getTime() + shiftEnd),
        })),
      ].map(({ event, start: at, end: until }) => this.#copyEvent(event, at, until)),
    );
  }

  /**
   * The dragged block goes where it was dropped and every other gathered one moves by the same
   * distance — the whole batch as one step, so ⌘Z takes it back in one press.
   */
  #retimeBatch(drag: DragState, start: Date, end: Date) {
    const was = drag.event;
    if (!was) return;
    const shiftStart = start.getTime() - new Date(was.start).getTime();
    const shiftEnd = end.getTime() - new Date(was.end).getTime();
    // A resize drags one edge, so the others' starts stay put and only their ends follow.
    const moving = drag.kind === "resize" ? 0 : shiftStart;

    return this.#batch(
      [
        { event: was, start, end },
        ...drag.others.map((event) => ({
          event,
          start: new Date(new Date(event.start).getTime() + moving),
          end: new Date(new Date(event.end).getTime() + shiftEnd),
        })),
      ].map(({ event, start: at, end: until }) => this.#retimeStep(event, at, until)),
    );
  }

  // --- writes ---------------------------------------------------------------

  /** Whether the block is one the calendar hasn't given a real id to yet — see `#create`. */
  isDraft(id: string) {
    return id.startsWith(DRAFT_PREFIX);
  }

  /** The event a draft turned into, for whatever was open on it — null for any other id. */
  becameId(id: string) {
    return this.#became.get(id) ?? null;
  }

  /**
   * The editor holds its own copy of the fields it's showing and writes them back when it closes,
   * which is an argument an undo would lose — so an undo closes it first.
   */
  undo() {
    this.deselect();
    return this.history.undo();
  }

  redo() {
    this.deselect();
    return this.history.redo();
  }

  async mapEvent(
    event: CalendarEvent,
    scope: MappingScope,
    choice: { activityId?: string; weights?: ActivityWeight[] },
  ) {
    const ref = this.#ref(event);
    const before = mappingOf(event);
    if (!(await this.#writeMapping(ref, event, scope, choice))) return;

    this.history.push({
      // The write may have been a series mapping over an instance one: clearing what it wrote is
      // what lets the older, narrower mapping underneath count again.
      undo: async () =>
        (await this.#writeMapping(ref, event, scope, null)) &&
        (before ? this.#writeMapping(ref, event, before.scope, before.choice) : true),
      redo: () => this.#writeMapping(ref, event, scope, choice),
    });
  }

  /** Context-menu duplicate: a new event with the same fields, placed right after the original. */
  duplicateEvent(event: CalendarEvent) {
    const duration = new Date(event.end).getTime() - new Date(event.start).getTime();
    const start = new Date(event.end);
    const end = new Date(start.getTime() + duration);
    return this.#copyEvent(event, start, end);
  }

  duplicateEvents(events: readonly CalendarEvent[]) {
    return Promise.all(events.map((event) => this.duplicateEvent(event)));
  }

  async unmapEvent(event: CalendarEvent) {
    const ref = this.#ref(event);
    const before = mappingOf(event);
    const scope = event.mappingScope ?? "instance";
    if (!(await this.#writeMapping(ref, event, scope, null)) || !before) return;

    this.history.push({
      undo: () => this.#writeMapping(ref, event, before.scope, before.choice),
      redo: () => this.#writeMapping(ref, event, scope, null),
    });
  }

  /** The editor saves title, notes and times together — one write, so one refetch and one undo. */
  async editEvent(event: CalendarEvent, patch: { title?: string; description?: string; start?: Date; end?: Date }) {
    const ref = this.#ref(event);
    const before: EventFields = {
      title: event.title,
      description: event.description,
      start: new Date(event.start),
      end: new Date(event.end),
    };
    const after: EventFields = {
      title: patch.title ?? before.title,
      description: patch.description ?? before.description,
      start: patch.start ?? before.start,
      end: patch.end ?? before.end,
    };
    // A block the calendar hasn't answered for yet has no id to write against, so the edit is
    // drawn where the block already is and sent the moment the create comes back — see `#create`.
    if (this.isDraft(event.id)) {
      this.#draftEdits.set(event.id, after);
      this.#pending.set(event.id, {
        ...event,
        title: after.title,
        description: after.description,
        start: after.start.toISOString(),
        end: after.end.toISOString(),
      });
      return;
    }
    if (!(await this.#writeFields(ref, event, after))) return;

    this.history.push({
      undo: () => this.#writeFields(ref, event, before),
      redo: () => this.#writeFields(ref, event, after),
    });
  }

  retimeEvent(event: CalendarEvent, start: Date, end: Date) {
    return this.editEvent(event, { start, end });
  }

  async deleteEvent(event: CalendarEvent) {
    this.deselect();
    const ref = this.#ref(event);
    if (!(await this.#remove(ref))) return;

    this.history.push({ undo: () => this.#restore(ref, event), redo: () => this.#remove(ref) });
  }

  /** What a whole gathered batch counts as — one category over all of them, in one step. */
  mapEvents(events: readonly CalendarEvent[], weights: ActivityWeight[]) {
    return this.#batch(events.map((event) => this.#mapStep(event, weights)));
  }

  // --- batches: many writes, one step in history ------------------------------

  /**
   * Every write is drawn on the grid the moment it's asked for — `#run` draws before it queues —
   * so a batch of ten lands on screen at once and catches up with the server one write at a time.
   * The step recorded is the whole batch, which is what ⌘Z is expected to take back.
   */
  async #batch(steps: readonly HistoryStep[]) {
    const attempts = await Promise.all(steps.map((step) => step.redo().then((done) => (done ? step : null))));
    const done = attempts.filter((step): step is HistoryStep => step !== null);
    if (done.length === 0) return;

    this.history.push({ undo: () => runAll(done, "undo"), redo: () => runAll(done, "redo") });
  }

  /** One event's move, as a step that runs either way — what a batch is built out of. */
  #retimeStep(event: CalendarEvent, start: Date, end: Date): HistoryStep {
    const ref = this.#ref(event);
    const before: EventFields = {
      title: event.title,
      description: event.description,
      start: new Date(event.start),
      end: new Date(event.end),
    };
    const after: EventFields = { ...before, start, end };
    return {
      undo: () => this.#writeFields(ref, event, before),
      redo: () => this.#writeFields(ref, event, after),
    };
  }

  /** One event's mapping, as a step that runs either way — see `mapEvent` for the single case. */
  #mapStep(event: CalendarEvent, weights: ActivityWeight[]): HistoryStep {
    const ref = this.#ref(event);
    const before = mappingOf(event);
    return {
      undo: async () =>
        (await this.#writeMapping(ref, event, "instance", null)) &&
        (before ? this.#writeMapping(ref, event, before.scope, before.choice) : true),
      redo: () => this.#writeMapping(ref, event, "instance", { weights }),
    };
  }

  // --- one write each, so an undo can run the same one backwards -------------

  async #writeFields(ref: EventRef, was: CalendarEvent, fields: EventFields): Promise<boolean> {
    const done = await this.#run(
      () =>
        updateCalendarEvent(ref.id, {
          calendarId: ref.calendarId,
          title: fields.title,
          // An empty string is how the calendar is told the notes are gone; leaving it out keeps them.
          description: fields.description ?? "",
          start: fields.start.toISOString(),
          end: fields.end.toISOString(),
        }),
      {
        id: ref.id,
        event: {
          ...was,
          id: ref.id,
          calendarId: ref.calendarId,
          title: fields.title,
          description: fields.description,
          start: fields.start.toISOString(),
          end: fields.end.toISOString(),
        },
      },
    );
    return done !== null;
  }

  /**
   * Set or clear what an event counts as. A whole series recolours every instance of it, which is
   * more than this screen can work out on its own — so only the single-instance case gets to show
   * its answer early.
   */
  async #writeMapping(
    ref: EventRef,
    was: CalendarEvent,
    scope: MappingScope,
    choice: Mapping["choice"] | null,
  ): Promise<boolean> {
    // Read when the write is actually sent: an event put back by an undo is a new event by then.
    const target = () => ({
      calendarId: ref.calendarId,
      externalEventId: scope === "series" && was.seriesId ? was.seriesId : ref.id,
      scope,
    });
    const activity = store.activities.value?.find((a) => a.id === choice?.activityId) ?? null;
    const restyle = (event: CalendarEvent): CalendarEvent => ({
      ...event,
      mappingScope: choice ? scope : null,
      activityId: choice?.activityId ?? null,
      activityName: choice ? (activity?.name ?? null) : null,
      weights: choice ? (choice.weights ?? activity?.weights ?? []) : [],
    });
    const drawn: Drawn[] =
      scope === "instance"
        ? [{ id: ref.id, event: restyle({ ...was, id: ref.id, calendarId: ref.calendarId }) }]
        : was.seriesId
          ? this.events
              .filter((event) => event.seriesId === was.seriesId)
              .map((event) => ({ id: event.id, event: restyle(event) }))
          : [];

    const done = await this.#run<unknown>(
      () => (choice ? saveEventMapping({ ...target(), ...choice }) : removeEventMapping(target())),
      drawn,
    );
    return done !== null;
  }

  async #remove(ref: EventRef): Promise<boolean> {
    const done = await this.#run(() => deleteCalendarEvent(ref.id, ref.calendarId), { id: ref.id, event: null });
    return done !== null;
  }

  /**
   * Puts a deleted event back. The calendar gives it a new id, so the handle every step of this
   * event's history holds is moved onto it — and the mapping, which the delete took with it, is
   * written again over the new event.
   */
  async #restore(ref: EventRef, was: CalendarEvent): Promise<boolean> {
    const created = await this.#run(
      async () => {
        const event = await createCalendarEvent({
          activityId: was.activityId ?? undefined,
          calendarId: was.calendarId,
          title: was.title,
          description: was.description ?? undefined,
          start: was.start,
          end: was.end,
        });
        // An activity maps itself on the way in; a split of categories has to be written after.
        if (!was.activityId && was.mappingScope === "instance" && was.weights.length > 0) {
          await saveEventMapping({
            calendarId: event.calendarId,
            externalEventId: event.id,
            scope: "instance",
            weights: was.weights,
          });
        }
        return event;
      },
      { id: ref.id, event: { ...was, id: ref.id, calendarId: ref.calendarId } },
    );
    if (!created) return false;

    this.#moveRef(ref, created);
    return true;
  }

  /**
   * Points every step and every queued write that holds this handle at the event the calendar has
   * actually made — what was written against a made-up id lands on the real one.
   */
  #moveRef(ref: EventRef, created: CalendarEvent) {
    this.#refs.delete(ref.id);
    ref.id = created.id;
    ref.calendarId = created.calendarId;
    this.#refs.set(ref.id, ref);
  }

  /**
   * The one handle for an event, shared by every step that touches it. Old entries are worth no
   * more than the events they point at, so the map is emptied rather than grown without end —
   * the steps holding a handle keep working, they just stop being found by id.
   */
  #ref(event: CalendarEvent): EventRef {
    const known = this.#refs.get(event.id);
    if (known) return known;
    if (this.#refs.size > REF_LIMIT) this.#refs.clear();
    const ref = { id: event.id, calendarId: event.calendarId };
    this.#refs.set(event.id, ref);
    return ref;
  }

  /**
   * A new block has no id until the calendar gives it one, so it's drawn under a made-up one and
   * the real event takes its place when the refetch lands.
   */
  async #create(activityId: string | null, title: string, start: Date, end: Date, openAt: DOMRect | null = null) {
    const activity = store.activities.value?.find((a) => a.id === activityId) ?? null;
    const draft: CalendarEvent = {
      id: `${DRAFT_PREFIX}${this.#nextTempId++}`,
      calendarId: this.week.value?.writeCalendarId ?? "",
      seriesId: null,
      title,
      description: null,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      declined: false,
      tentative: false,
      readOnly: false,
      countsTowardHours: true,
      url: null,
      mappingScope: activityId ? "instance" : null,
      activityId,
      activityName: activity?.name ?? null,
      weights: activity?.weights ?? [],
    };
    // The handle is taken on the draft, so the editor's writes queue up behind the create against
    // a made-up id and land on the real one — nothing here waits on Google to be usable.
    const ref = this.#ref(draft);
    if (openAt) {
      this.unnamedId = draft.id;
      this.select(draft, openAt);
    }

    const created = await this.#run(
      async () => {
        const event = await createCalendarEvent({
          activityId: activityId ?? undefined,
          title,
          start: start.toISOString(),
          end: end.toISOString(),
        });
        // Written before the refetch that takes the draft off the grid, so nothing open on the
        // draft is ever left looking at a block that isn't there — see `selected`.
        if (this.#became.size > REF_LIMIT) this.#became.clear();
        this.#became.set(draft.id, event.id);
        await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
        return event;
      },
      { id: draft.id, event: draft },
    );
    if (!created) {
      // Nothing was made, so there's nothing to have open — the error says why.
      this.#draftEdits.delete(draft.id);
      if (this.selectedId === draft.id) this.deselect();
      return;
    }

    this.#moveRef(ref, created);
    // Whatever was open on the draft moves onto the event the calendar made — the same block as
    // far as the screen is concerned, and now one that can be written to directly.
    if (this.unnamedId === draft.id) this.unnamedId = created.id;
    if (this.selectedId === draft.id) this.select(created, this.selectedRect);

    // Whatever was typed into the block while it was a draft, as one write against the real event.
    const edited = this.#draftEdits.get(draft.id);
    this.#draftEdits.delete(draft.id);
    if (edited) void this.#writeFields(ref, created, edited);
    this.history.push({ undo: () => this.#remove(ref), redo: () => this.#restore(ref, created) });
  }

  /** Alt-drag on an existing block: a new event with the same fields, dropped at the new time. */
  async #copyEvent(was: CalendarEvent, start: Date, end: Date) {
    const draft: CalendarEvent = {
      ...was,
      id: `${DRAFT_PREFIX}${this.#nextTempId++}`,
      seriesId: null,
      start: start.toISOString(),
      end: end.toISOString(),
    };
    const created = await this.#run(
      async () => {
        const event = await createCalendarEvent({
          activityId: was.activityId ?? undefined,
          title: was.title,
          description: was.description ?? undefined,
          start: start.toISOString(),
          end: end.toISOString(),
        });
        // An activity maps itself on the way in; a split of categories has to be written after.
        if (!was.activityId && was.mappingScope === "instance" && was.weights.length > 0) {
          await saveEventMapping({
            calendarId: event.calendarId,
            externalEventId: event.id,
            scope: "instance",
            weights: was.weights,
          });
        }
        await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
        return event;
      },
      { id: draft.id, event: draft },
    );
    if (!created) return;

    const ref = this.#ref(created);
    this.history.push({ undo: () => this.#remove(ref), redo: () => this.#restore(ref, created) });
  }

  /**
   * Every write puts its answer on the grid first and asks the server second. The server is still
   * the truth: the week is refetched either way, and the drawn-ahead version is only dropped once
   * that refetch has landed — so a write that failed rolls back to what the server actually holds
   * without a frame of the old value showing in between.
   *
   * The asking is one at a time. Two writes to the same event in flight together land in whichever
   * order Google gets to them, and undoing three edits in a second is exactly that case.
   */
  #run<T>(action: () => Promise<T>, drawn?: Drawn | readonly Drawn[]): Promise<T | null> {
    const drawnList = drawn ? (Array.isArray(drawn) ? drawn : [drawn]) : [];
    // Drawn now, before anything is queued: this is the whole point of drawing ahead. Holding
    // ⌘Z stacks its answers up on the grid at once and lets the writes catch up behind them.
    const token = Symbol("write");
    for (const one of drawnList) {
      this.#pending.set(one.id, one.event);
      this.#drawnBy.set(one.id, token);
    }
    this.actionError = null;
    /** Whether this write's version of the block is still the one on screen — see `#drawnBy`. */
    const current = () => drawnList.length > 0 && drawnList.every((one) => this.#drawnBy.get(one.id) === token);

    const run = this.#queue.then(async () => {
      // What the write answered, kept so the step that recorded it can be run backwards later.
      let answer: T | null = null;
      let saved = false;
      try {
        answer = await action();
        invalidate.calendar();
        saved = true;
      } catch (e) {
        this.actionError = e instanceof Error ? e.message : "That didn't save.";
      }
      try {
        // Nothing to wait for once a later write has drawn over this one: the block on screen is
        // that write's now, and it does its own settling. Waiting here would only put this
        // write's older version back for as long as the waiting took.
        if (saved && drawnList.length > 0 && current()) await this.#settle(drawnList);
        else await this.refreshWeeks();
      } finally {
        if (current()) {
          for (const one of drawnList) {
            this.#pending.delete(one.id);
            this.#drawnBy.delete(one.id);
          }
        }
      }
      return saved ? answer : null;
    });
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Google will happily answer a read with the version from before the write it just accepted, so
   * refetching once and trusting it is how a block ends up back where it started a second after
   * being moved. The drawn-ahead version stays up until the server's answer matches it, or until
   * asking again stops being worth the wait — at which point what the server says wins anyway.
   */
  async #settle(drawn: readonly Drawn[]) {
    for (let attempt = 0; ; attempt++) {
      await this.refreshWeeks();
      if (attempt >= SETTLE_ATTEMPTS - 1 || drawn.every((one) => this.#serverAgrees(one))) return;
      await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));
    }
  }

  #serverAgrees(drawn: Drawn) {
    const events = this.weeks.flatMap((week) => week.value?.events ?? []);
    // A deletion: agreement is the event being gone.
    if (!drawn.event) return !events.some((event) => event.id === drawn.id);
    // A creation, which has no server id to look up — the slot it was drawn in being taken is
    // as close as this gets.
    const wanted = drawn.event;
    if (drawn.id.startsWith(DRAFT_PREFIX)) return events.some((event) => sameTimes(event, wanted));
    const found = events.find((event) => event.id === drawn.id);
    return Boolean(
      found && sameTimes(found, wanted) && found.title === wanted.title && found.activityId === wanted.activityId,
    );
  }

  // --- pointer geometry -----------------------------------------------------

  #arm(input: {
    kind: DragKind;
    activity: Activity | null;
    event: CalendarEvent | null;
    e: PointerEvent;
    armed: boolean;
    longPress?: boolean;
    locked?: boolean;
    copy?: boolean;
  }) {
    // Otherwise a press-drag across a title selects its text instead of moving the block.
    input.e.preventDefault();
    this.#dragged = false;
    const pending: PendingDrag = {
      kind: input.kind,
      el: input.e.currentTarget as Element,
      pointerId: input.e.pointerId,
      originX: input.e.clientX,
      originY: input.e.clientY,
      activity: input.activity,
      event: input.event,
      locked: input.locked ?? false,
      copy: input.copy ?? false,
      armed: input.armed,
      timer: null,
    };
    // Captured immediately, not once a drag is confirmed — otherwise a fast flick outruns hit
    // testing on this element before the threshold/long-press fires, and pointermove goes silent
    // until the pointer happens to land on another element wired to the same handler. A captured
    // pointer's click still lands here as normal, so the tap opens the event as long as `#dragged`
    // stays false — that flag, not capture timing, is what tells `tap()` to swallow the click.
    pending.el.setPointerCapture?.(input.e.pointerId);
    if (input.longPress) pending.timer = setTimeout(() => this.#start(pending), LONG_PRESS_MS);
    this.#pendingDrag = pending;
    if (input.armed) this.#start(pending);
  }

  #start(pending: PendingDrag) {
    if (this.drag || pending.locked) return;
    pending.armed = true;
    this.#dragged = true;
    if (pending.timer) clearTimeout(pending.timer);

    this.#grabOffsetMinutes = 0;
    this.#grabOffsetDays = 0;

    if (pending.kind === "create" && pending.activity) {
      const dayIndex = daysBetween(this.stripStart, this.windowStart);
      this.drag = {
        kind: "create",
        title: pending.activity.name,
        weights: pending.activity.weights,
        activityId: pending.activity.id,
        event: null,
        copy: false,
        others: [],
        day: this.windowStart,
        startMinutes: 0,
        endMinutes: DEFAULT_EVENT_MINUTES,
        freeStartMinutes: 0,
        freeEndMinutes: DEFAULT_EVENT_MINUTES,
        freeDayIndex: dayIndex,
      };
      return;
    }
    if (!pending.event) return;

    const start = new Date(pending.event.start);
    const end = new Date(pending.event.end);
    const day = startOfDay(start);
    const startMinutes = (start.getTime() - day.getTime()) / 60_000;
    // Counted from the same midnight as the start, so an event that already spans days keeps its
    // whole length rather than folding back to the hour its end reads on its own day.
    const endMinutes = (end.getTime() - day.getTime()) / 60_000;
    const dayIndex = daysBetween(this.stripStart, day);

    // A move grabs the block wherever the pointer landed on it, not its top-left corner —
    // remember the gap so the block doesn't jump to put that corner under the pointer once
    // dragging starts.
    if (pending.kind === "move") {
      const origin = this.#pointerToSlot({ clientX: pending.originX, clientY: pending.originY } as PointerEvent);
      if (origin) {
        this.#grabOffsetMinutes = startMinutes - origin.rawMinutes;
        this.#grabOffsetDays = dayIndex - origin.rawIndex;
      }
    }

    // Dragging one of the gathered blocks drags the lot: the others keep their distance from it,
    // so a batch moves as the shape it already was. Anything read-only can't come along.
    const others = this.picked.has(pending.event.id)
      ? this.pickedEvents.filter((event) => event.id !== pending.event?.id && !event.readOnly && !event.allDay)
      : [];

    this.drag = {
      kind: pending.kind,
      title: pending.event.title,
      weights: pending.event.weights,
      activityId: pending.event.activityId,
      event: pending.event,
      copy: pending.kind === "move" && pending.copy,
      others,
      day,
      startMinutes,
      endMinutes,
      freeStartMinutes: startMinutes,
      freeEndMinutes: endMinutes,
      freeDayIndex: dayIndex,
    };
  }

  #cancelPending() {
    if (this.#pendingDrag?.timer) clearTimeout(this.#pendingDrag.timer);
    this.#pendingDrag = null;
  }

  /**
   * Where the pointer is in the grid's own units, with nothing added or rounded off.
   *
   * The grid is exactly one day tall, but a drag doesn't stop at its edges: minutes come back
   * unheld, so a pointer above the top reads negative and one below the foot reads past 1440.
   * That's what carries a block or an edge into the day on either side of the one it's over.
   */
  #pointerToRaw(e: { clientX: number; clientY: number }): { dayIndex: number; minutes: number } | null {
    if (!this.columnsEl) return null;
    const rect = this.columnsEl.getBoundingClientRect();
    return {
      dayIndex: clamp(((e.clientX - rect.left) / rect.width) * STRIP_DAYS, 0, STRIP_DAYS),
      minutes: ((e.clientY - rect.top) / rect.height) * MINUTES_PER_DAY,
    };
  }

  /** The same point held inside the day — what a rectangle drawn on the grid can actually show. */
  #pointerToPoint(e: { clientX: number; clientY: number }): { dayIndex: number; minutes: number } | null {
    const at = this.#pointerToRaw(e);
    return at && { dayIndex: at.dayIndex, minutes: clamp(at.minutes, 0, MINUTES_PER_DAY) };
  }

  /**
   * Where a dragged block's top-left corner lands: the column it's over, and minutes from that
   * column's midnight, which may run past either end of it — dragging down through the foot of the
   * grid carries the block into tomorrow morning, and up through the top into last night.
   */
  #pointerToSlot(e: PointerEvent): DragSlot | null {
    const at = this.#pointerToRaw(e);
    if (!at) return null;
    const rawIndex = clamp(at.dayIndex + this.#grabOffsetDays, 0, STRIP_DAYS - 1);
    const index = Math.round(rawIndex);
    const rawMinutes = at.minutes + this.#grabOffsetMinutes;
    return { day: addDays(this.stripStart, index), index, minutes: snapMinutes(rawMinutes), rawMinutes, rawIndex };
  }

  /**
   * Where a dragged edge is, in minutes from the start of `day` — past 1440 when the pointer has
   * moved into a later column or below the grid, negative when it's in an earlier one or above.
   *
   * The column is the one the pointer is inside, floored rather than rounded: an edge is being
   * pointed at, not a block being dropped, so the nearest column boundary isn't what's meant.
   */
  #pointerToEdge(e: PointerEvent, day: Date): { minutes: number; rawMinutes: number } | null {
    const at = this.#pointerToRaw(e);
    if (!at) return null;
    const column = clamp(Math.floor(at.dayIndex), 0, STRIP_DAYS - 1);
    const anchor = daysBetween(this.stripStart, day);
    return {
      minutes: this.#insideStrip(column, snapMinutes(at.minutes), anchor),
      rawMinutes: this.#insideStrip(column, at.minutes, anchor),
    };
  }

  /**
   * Minutes counted from column `column`, re-counted from day `anchor`, and held inside the drawn
   * strip — a drag can't reach a day that isn't there, or the drop target couldn't be seen. A block
   * being dragged passes its `length` so its far end stops at the edge too.
   */
  #insideStrip(column: number, minutes: number, anchor: number, length = 0): number {
    const room = STRIP_DAYS * MINUTES_PER_DAY - length;
    return clamp(column * MINUTES_PER_DAY + minutes, 0, room) - anchor * MINUTES_PER_DAY;
  }

  #instantAt(day: Date, minutes: number): Date {
    const at = new Date(day);
    at.setMinutes(minutes);
    return at;
  }

  #autoscrollNear(clientY: number) {
    const scroller = this.scrollerEl;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const direction = clientY < rect.top + AUTOSCROLL_EDGE_PX ? -1 : clientY > rect.bottom - AUTOSCROLL_EDGE_PX ? 1 : 0;

    if (direction === 0) return this.#stopAutoscroll();
    if (this.#autoscroll !== null) return;
    const step = () => {
      scroller.scrollBy({ top: direction * AUTOSCROLL_STEP_PX });
      this.#autoscroll = requestAnimationFrame(step);
    };
    this.#autoscroll = requestAnimationFrame(step);
  }

  #stopAutoscroll() {
    if (this.#autoscroll === null) return;
    cancelAnimationFrame(this.#autoscroll);
    this.#autoscroll = null;
  }
}

/** Every write of a batch at once; the answer is whether all of them landed. */
async function runAll(steps: readonly HistoryStep[], which: "undo" | "redo") {
  const results = await Promise.all(steps.map((step) => step[which]()));
  return results.every(Boolean);
}

/** What the event counts as right now, in the shape a write takes — so an undo can put it back. */
function mappingOf(event: CalendarEvent): Mapping | null {
  if (!event.mappingScope) return null;
  return {
    scope: event.mappingScope,
    choice: event.activityId ? { activityId: event.activityId } : { weights: event.weights },
  };
}

/** Times come back RFC 3339 with a zone offset, which the same instant can spell more than one way. */
function sameTimes(a: CalendarEvent, b: CalendarEvent) {
  return (
    new Date(a.start).getTime() === new Date(b.start).getTime() &&
    new Date(a.end).getTime() === new Date(b.end).getTime()
  );
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export const calendarData = new CalendarData();
