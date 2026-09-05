import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { clock } from "$lib/clock.svelte";
import { addDays, DAYS_PER_WEEK, MINUTES_PER_DAY, startOfDay, startOfWeek, weekKey } from "$lib/dates";
import { diagnostics } from "$lib/diagnostics.svelte";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  type EventPatch,
  removeEventMapping,
  saveEventMapping,
  updateCalendarEvent,
} from "$lib/queries";
import { applyCalendarEvent, calendarWeek, dropCalendarEvent, invalidate, store } from "$lib/store.svelte";
import { activities, practices, projects, synced } from "$lib/synced.svelte";
import { type ActivityWeight, type CalendarEvent, type EventTimer, type MappingScope, NOT_A_MEETING } from "$lib/types";
import { viewport } from "$lib/viewport.svelte";
import type { HistoryStep } from "./history.svelte";
import { CalendarHistory } from "./history.svelte";
import { DEFAULT_EVENT_MINUTES, SNAP_MINUTES, segmentsForRange, snapMinutes } from "./week-grid";

/**
 * Three weeks of columns, so there's a week to scroll into on either side of the ones shown.
 *
 * A wider strip would be a week's worth of requests spent on days nobody has asked for. Scrolling
 * into a week that hasn't arrived draws its columns empty and fills them a moment later, which is
 * the right way round: the grid is the screen, and the events are what lands in it.
 */
const SIDE_WEEKS = 1;
/** Day columns a window narrower than the rail's breakpoint holds — see `CalendarData.visibleDays`. */
const PHONE_DAYS = 3;
export const STRIP_WEEKS = 2 * SIDE_WEEKS + 1;
export const STRIP_DAYS = STRIP_WEEKS * DAYS_PER_WEEK;

/** How far a finger has to travel before a tap becomes a drag, and how long before a hold does. */
const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 350;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 12;

/** How many events keep a handle before the lot is dropped — see `#ref`. */
const REF_LIMIT = 200;

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

/** The block as the write will leave it, as far as this screen can tell before the answer. */
function drawnWith(event: CalendarEvent, patch: EventPatch): CalendarEvent {
  return {
    ...event,
    ...(patch.location === undefined ? {} : { location: patch.location || null }),
    ...(patch.timeZone === undefined ? {} : { timeZone: patch.timeZone }),
    ...(patch.start === undefined ? {} : { start: patch.start }),
    ...(patch.end === undefined ? {} : { end: patch.end }),
    ...(patch.reminders === undefined ? {} : { reminders: patch.reminders }),
    ...(patch.conference === "remove" ? { conferenceUrl: null, conferenceName: null } : {}),
    ...(patch.attendees === undefined
      ? {}
      : {
          attendees: patch.attendees.map((guest) => {
            const known = event.attendees.find((a) => a.email?.toLowerCase() === guest.email.toLowerCase());
            return (
              known ?? {
                email: guest.email,
                name: null,
                self: false,
                response: "needsAction",
                optional: guest.optional === true,
              }
            );
          }),
        }),
  };
}

function sameFields(a: EventFields, b: EventFields) {
  return (
    a.title === b.title &&
    (a.description ?? "") === (b.description ?? "") &&
    a.start.getTime() === b.start.getTime() &&
    a.end.getTime() === b.end.getTime()
  );
}

/**
 * What the hour was for — a project, a practice, a task — on top of what it counts as, and how a
 * timer run for it is broken up. All of it rides on the mapping, so all of it travels together.
 */
export interface Purpose {
  readonly projectId: string | null;
  readonly practiceId: string | null;
  readonly taskId: string | null;
  readonly timer: EventTimer | null;
  /** The integration feed it is linked to — "apple-health:sleep" — which is also on the mapping. */
  readonly source: string | null;
}

const NO_PURPOSE: Purpose = {
  projectId: null,
  practiceId: null,
  taskId: null,
  timer: null,
  source: null,
};

/** What an event counts as, in the shape the mapping endpoints take. */
interface Mapping {
  readonly scope: MappingScope;
  readonly choice: { activityId?: string; weights?: ActivityWeight[] };
  readonly purpose: Purpose;
}

/**
 * What a chip dragged in from the rail becomes: an activity, or a project (or one of its tasks)
 * counting toward its sphere. Title and weights are what the ghost draws; the ids are what the
 * event is mapped as when it lands.
 */
export interface DragSource {
  readonly title: string;
  readonly weights: ActivityWeight[];
  readonly activityId: string | null;
  readonly projectId: string | null;
  readonly taskId: string | null;
}

/**
 * A recurring event was just edited on this occurrence alone — offered up in case the change was
 * meant for every occurrence. Holding ⌘/Ctrl through a drag skips this and detaches the occurrence
 * on purpose, which is why the prompt only ever appears after a write that didn't ask for that.
 */
export interface SeriesPrompt {
  /** Bumped per offer, so a second edit's card is a new card rather than the old one relabelled. */
  readonly id: number;
  readonly ref: EventRef;
  readonly seriesId: string;
  readonly title: string;
  readonly fields: EventFields;
  readonly previousStart: Date;
  readonly previousEnd: Date;
  /** The rest of what a card changes — a place, a guest list — when that is what was edited. */
  readonly patch?: EventPatch;
}

export interface DragState {
  readonly kind: DragKind;
  readonly title: string;
  readonly weights: ActivityWeight[];
  readonly activityId: string | null;
  /** What a create drag will make — null for every drag of an existing block. */
  readonly source: DragSource | null;
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
  readonly source: DragSource | null;
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
  /**
   * How many day columns the window holds. A phone gets three: seven columns on a 390pt screen
   * leave a block 45pt wide, which is narrower than the finger meant to grab it and too narrow to
   * carry a title. Everything that counts days — where a jump lands, which week the meters are
   * about, how far a slide travels — reads this rather than assuming a week.
   */
  readonly visibleDays = $derived(viewport.md ? DAYS_PER_WEEK : PHONE_DAYS);

  /** Opens on the current week — or, where the window is narrower than one, on today. */
  #anchor = $state(viewport.md ? startOfWeek(new Date()) : startOfDay(new Date()));

  get anchor() {
    return this.#anchor;
  }

  /**
   * Assigned rather than only stepped, from the menu bar as well as from this screen — so this is
   * the one place that knows the window has moved, and the place the caches behind it are
   * resolved from. See `#resolveWeeks` for why that can't be left to the deriveds below.
   */
  set anchor(value: Date) {
    const day = startOfDay(value);
    // Same day, new `Date` — the grid's deriveds are all objects, so an assignment that changes
    // nothing would still invalidate every one of them and have the grid re-place its whole strip.
    if (day.getTime() === this.#anchor.getTime()) return;
    this.#anchor = day;
    this.#resolveWeeks();
  }

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
  drag = $state<DragState | null>(null);
  /**
   * Set right before a jump that didn't come from a swipe (today, a month arrow, a tapped date in
   * the month grid), so the grid eases the scroll there instead of the instant, no-op-looking snap
   * a Monday-to-Monday jump would otherwise be — the strip recentres on the same offset either way,
   * so without this the columns swap out with no visible motion. The grid clears it once consumed.
   */
  animateNextJump = $state(false);
  /** A just-edited recurring occurrence, offered the choice to apply the same edit series-wide. */
  seriesPrompt = $state<SeriesPrompt | null>(null);
  #seriesPrompts = 0;
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
  /**
   * Minutes between the pointer and the dragged edge at grab time. A band is taller than a line,
   * so the edge is almost never exactly under the finger — without this the block snaps to
   * wherever the press landed inside the band, and a press that never moves resizes it.
   */
  #grabEdgeMinutes = 0;
  /** Whether the press that's ending actually moved something, so its click isn't read as a tap. */
  #dragged = false;
  #autoscroll: number | null = null;
  /** Where the press on empty grid landed, so a release that travelled isn't read as a tap. */
  #pressAt: { x: number; y: number } | null = null;
  /** The last tap on empty grid, which the next one is measured against — see `tapEmpty`. */
  #lastTap: { x: number; y: number; at: number } | null = null;

  /** The first day on screen — any day, not just a Monday. */
  readonly windowStart = $derived(startOfDay(this.anchor));

  /**
   * The grid draws whole weeks and shows a run of days out of them, so there's always room to
   * scroll into on either side and the day columns line up with the week the events came in.
   */
  readonly stripStart = $derived(addDays(startOfWeek(this.windowStart), -SIDE_WEEKS * DAYS_PER_WEEK));
  readonly dayOffset = $derived(daysBetween(this.stripStart, this.windowStart));

  /**
   * The strip's caches, put here by `#resolveWeeks` rather than worked out on demand: making a
   * week is a write, and a write is the one thing a `$derived` may not do. The derived below is
   * only the reading half, which is what every screen and every meter actually wants.
   */
  #stripWeeks = $state(stripWeeksFrom(this.stripStart));
  readonly weeks = $derived(this.#stripWeeks);

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
    if (preview && previewed)
      byId.set(preview.id, {
        ...previewed,
        start: preview.start,
        end: preview.end,
      });
    const prefs = store.calendars.value;
    if (!prefs) return [...byId.values()];
    // `accounts` is absent when the server is older than this bundle — which the macOS build can
    // be, since it runs local code against the deployed API. No calendars is a week that draws
    // everything, not a screen that dies.
    const allCalendars = (prefs.accounts ?? []).flatMap((a) => a.calendars);
    const primaryIds = new Set(allCalendars.filter((c) => c.primary).map((c) => c.id));
    const shownIds = prefs.visibleCalendarIds.length === 0 ? primaryIds : new Set(prefs.visibleCalendarIds);
    return [...byId.values()].filter((event) => shownIds.has(event.calendarId));
  });

  /**
   * What the meters total against: `events`, with whatever a live move or resize would do to a
   * block laid over the top — so a category's number follows the pointer instead of waiting for
   * the drop's write. Kept apart from `events` itself, which the grid positions blocks from and
   * which alt-drag's ghost already covers on its own.
   */
  readonly eventsForTotals = $derived.by(() => {
    const drag = this.drag;
    if (!drag?.event || (drag.kind !== "move" && drag.kind !== "resize" && drag.kind !== "resize-start")) {
      return this.events;
    }
    const was = drag.event;
    const start = this.#instantAt(drag.day, drag.startMinutes);
    const end = this.#instantAt(drag.day, drag.endMinutes);
    const shiftStart = start.getTime() - new Date(was.start).getTime();
    const shiftEnd = end.getTime() - new Date(was.end).getTime();
    const byId = new Map(this.events.map((event) => [event.id, event]));

    // Alt-drag drops a duplicate and leaves the original where it was, so the total gains a block
    // instead of moving one.
    if (drag.copy) {
      const extra = [
        {
          ...was,
          id: `${was.id}:drag-copy`,
          start: start.toISOString(),
          end: end.toISOString(),
        },
        ...drag.others.map((event) => ({
          ...event,
          id: `${event.id}:drag-copy`,
          start: new Date(new Date(event.start).getTime() + shiftStart).toISOString(),
          end: new Date(new Date(event.end).getTime() + shiftEnd).toISOString(),
        })),
      ];
      return [...byId.values(), ...extra];
    }

    // A resize drags one edge, so the others' starts stay put and only their ends follow — the
    // same rule `#retimeBatch` writes once the drag ends.
    const moving = drag.kind === "resize" ? 0 : shiftStart;
    byId.set(was.id, {
      ...was,
      start: start.toISOString(),
      end: end.toISOString(),
    });
    for (const event of drag.others) {
      byId.set(event.id, {
        ...event,
        start: new Date(new Date(event.start).getTime() + moving).toISOString(),
        end: new Date(new Date(event.end).getTime() + shiftEnd).toISOString(),
      });
    }
    return [...byId.values()];
  });

  /**
   * The window can straddle two calendar weeks; the one holding its middle day is the week the
   * meters and the title are about. Stepping to that middle day lands on it by itself.
   */
  readonly weekStart = $derived(startOfWeek(addDays(this.windowStart, Math.floor(this.visibleDays / 2))));
  readonly key = $derived(weekKey(this.weekStart));
  /** The focused week's cache, resolved alongside the strip's and read the same way. */
  #focusedWeek = $state(calendarWeek(this.key));
  readonly week = $derived(this.#focusedWeek);

  /**
   * Whether the account's calendar connection is a settled question. Days, hours and today's line
   * are the grid whether or not anything is connected, so the week draws from the first frame and
   * nothing on the screen may say "connect" until the server has actually said there's nothing to
   * connect to — the alternative is asking every cold start and taking it back a moment later.
   */
  readonly connectionKnown = $derived(this.weeks.some((week) => week.hasValue) || store.integrations.hasValue);
  readonly connected = $derived(
    this.week.value?.connected ?? store.integrations.value?.some((i) => i.connected) ?? false,
  );
  readonly needsReconnect = $derived(this.week.value?.needsReconnect ?? false);
  readonly isThisWeek = $derived(this.key === weekKey(clock.now));

  /** "August 2026", or "Jul – Aug 2026" for the weeks that straddle two. */
  readonly monthLabel = $derived.by(() => {
    const end = addDays(this.weekStart, DAYS_PER_WEEK - 1);
    const year = end.getFullYear();
    if (this.weekStart.getMonth() === end.getMonth()) {
      return `${end.toLocaleDateString(undefined, { month: "long" })} ${year}`;
    }
    const from = this.weekStart.toLocaleDateString(undefined, {
      month: "short",
    });
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
    this.marquee = {
      fromDay: at.dayIndex,
      fromMinutes: at.minutes,
      toDay: at.dayIndex,
      toMinutes: at.minutes,
    };
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
   * Drops whatever the pointer had started — a pending or running drag, a gathering box — without
   * applying any of it. A pinch is what calls this: its first finger looks exactly like the start
   * of a drag, and the block must not move because the second finger arrived.
   */
  abortGesture() {
    this.#cancelPending();
    this.#stopAutoscroll();
    this.#pressAt = null;
    this.drag = null;
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
    return Promise.all([synced.ensure(), store.integrations.ensure(), this.ensureWeeks()]);
  }

  ensureWeeks() {
    this.#resolveWeeks();
    return Promise.all(this.#stripWeeks.map((week) => week.ensure()));
  }

  refreshWeeks() {
    this.#resolveWeeks();
    return Promise.all(this.#stripWeeks.map((week) => week.refresh()));
  }

  /**
   * Which caches the strip and the meters are reading, taken from the store by hand. `calendarWeek`
   * makes the week if the map hasn't got it, and making it writes the map — which is why this runs
   * on the imperative paths, where a write is only a write, and never from the deriveds that read
   * the result. Paging is what makes weeks: every path that moves the window comes through here.
   *
   * The arrays are replaced only when the set has actually changed, so scrolling within the three
   * weeks already on the strip, or a write's refetch, costs nothing downstream.
   */
  #resolveWeeks() {
    const strip = stripWeeksFrom(this.stripStart);
    if (strip.some((week, i) => week !== this.#stripWeeks[i])) {
      // Paging can push a week out of the store's map, and coming back to it makes a new, empty
      // cache. Nothing else knows it's empty, so the request that fills it starts here.
      for (const week of strip) if (!this.#stripWeeks.includes(week)) void week.ensure();
      this.#stripWeeks = strip;
    }
    const focused = calendarWeek(this.key);
    if (focused !== this.#focusedWeek) this.#focusedWeek = focused;
  }

  /** Scrolling sideways moves the window a day at a time. */
  goToDay(shift: number) {
    this.anchor = addDays(this.windowStart, shift);
    void this.ensureWeeks();
  }

  goToToday() {
    this.#jumpTo(new Date());
  }

  /** The month grid jumps straight to whichever week a tapped date falls in. */
  goToDate(date: Date) {
    this.#jumpTo(date);
  }

  /**
   * A jump to a week, from a button rather than a swipe. The flag is only raised when the window
   * actually moves: raising it for a tap on the week already on screen would have the grid play a
   * slide over columns that never changed, and the grid clears it only when it animates.
   */
  #jumpTo(date: Date) {
    // A week's worth of columns starts its week on a Monday; three columns can't hold a week, so
    // there the day asked for is the day drawn, first in the window.
    const target = this.visibleDays >= DAYS_PER_WEEK ? startOfWeek(date) : startOfDay(date);
    if (target.getTime() === this.#anchor.getTime()) return;
    this.animateNextJump = true;
    this.anchor = target;
    void this.ensureWeeks();
  }

  // --- dragging -------------------------------------------------------------

  /** A palette chip: a tap opens the thing, so the drag only starts once the finger moves. */
  beginCreate(source: DragSource, e: PointerEvent) {
    this.#arm({ kind: "create", source, event: null, e, armed: false });
  }

  /** A block the week filler proposed and the person accepted — the same write a drop makes. */
  placeBlock(source: DragSource, start: Date, end: Date) {
    return this.#create(source, source.title, start, end);
  }

  /** A project from the rail: a block that counts toward its sphere and is evidence for its gate. */
  sourceForProject(projectId: string, taskId: string | null = null): DragSource | null {
    const project = projects.all.find((p) => p.id === projectId);
    if (!project) return null;
    const task = taskId ? this.#taskTitle(taskId) : null;
    return {
      title: task ? `${project.name}: ${task}` : project.name,
      weights: [{ categoryId: project.categoryId, weightPercent: 100 }],
      activityId: null,
      projectId,
      taskId,
    };
  }

  #taskTitle(taskId: string) {
    return synced.models.tasks.all.find((t) => t.id === taskId)?.title ?? null;
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
      source: null,
      event,
      e,
      armed: false,
      longPress: event.movable,
      locked: !event.movable,
      copy: e.altKey,
    });
  }

  beginResize(event: CalendarEvent, e: PointerEvent) {
    if (!event.movable) return;
    if ((e.target as Element | null)?.closest("[data-category-badge]")) return;
    e.stopPropagation();
    // Not armed: a press on the band that never travels is a tap that opens the event, and the
    // threshold is what tells the two apart.
    this.#arm({ kind: "resize", source: null, event, e, armed: false });
  }

  /** Same handle as `beginResize`, dragging the top edge — the end stays put, the start follows. */
  beginResizeStart(event: CalendarEvent, e: PointerEvent) {
    if (!event.movable) return;
    if ((e.target as Element | null)?.closest("[data-category-badge]")) return;
    e.stopPropagation();
    this.#arm({ kind: "resize-start", source: null, event, e, armed: false });
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

  /**
   * `detach` is ⌘/Ctrl held at the moment of release: it means the occurrence is meant to come
   * loose from its series on purpose, so the usual after-the-fact "apply to the series?" offer is
   * skipped rather than asked and declined.
   */
  endDrag(e?: { metaKey: boolean; ctrlKey: boolean }) {
    this.#cancelPending();
    this.#stopAutoscroll();
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;

    const start = this.#instantAt(drag.day, drag.startMinutes);
    const end = this.#instantAt(drag.day, drag.endMinutes);
    const detach = Boolean(e?.metaKey || e?.ctrlKey);

    if (drag.kind === "create" && drag.source) void this.#create(drag.source, drag.title, start, end);
    else if (drag.event && drag.copy) void this.#copyBatch(drag, start, end);
    else if (drag.event && drag.others.length > 0) void this.#retimeBatch(drag, start, end);
    else if (drag.event) void this.retimeEvent(drag.event, start, end, detach);
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
    purpose?: Purpose,
  ) {
    const ref = this.#ref(event);
    const before = mappingOf(event);
    if (!(await this.#writeMapping(ref, event, scope, choice, purpose))) return;

    this.history.push({
      // The write may have been a series mapping over an instance one: clearing what it wrote is
      // what lets the older, narrower mapping underneath count again.
      undo: async () =>
        (await this.#writeMapping(ref, event, scope, null)) &&
        (before ? this.#writeMapping(ref, event, before.scope, before.choice, before.purpose) : true),
      redo: () => this.#writeMapping(ref, event, scope, choice, purpose),
    });
  }

  /**
   * What an hour was for, decided after the fact. Retro-tagging is how a real week gets
   * reconciled: a grey block somebody else booked becomes evidence for a gate, and an hour that
   * already counted toward a sphere is told which project in that sphere it belonged to. A block
   * that counted as nothing starts counting toward the project's own sphere in the same write.
   */
  async tagEvent(event: CalendarEvent, purpose: Partial<Purpose>) {
    const merged = mergePurpose(purposeOf(event), purpose);
    const existing = mappingOf(event);
    const scope: MappingScope = existing?.scope ?? (event.seriesId ? "series" : "instance");
    const sphere =
      projects.all.find((p) => p.id === merged.projectId)?.categoryId ??
      practices.all.find((p) => p.id === merged.practiceId)?.categoryId;
    const choice = existing?.choice ?? (sphere ? { weights: [{ categoryId: sphere, weightPercent: 100 }] } : null);
    if (!choice) return;
    await this.mapEvent(event, scope, choice, merged);
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
      undo: () => this.#writeMapping(ref, event, before.scope, before.choice, before.purpose),
      redo: () => this.#writeMapping(ref, event, scope, null),
    });
  }

  /**
   * The editor saves title, notes and times together — one write, so one refetch and one undo.
   * `detach` skips the series prompt entirely — see `endDrag`.
   */
  async editEvent(
    event: CalendarEvent,
    patch: { title?: string; description?: string; start?: Date; end?: Date },
    detach = false,
  ) {
    this.seriesPrompt = null;
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
    // A drag that lands where it started, or an editor closed without a change, is not an edit:
    // nothing is written, and above all nothing is asked about the rest of the series.
    if (sameFields(before, after)) return;
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
    // Offered before the write goes out, not after it comes back: the edit is already drawn on
    // the grid, so a card that waits for the server arrives long after the question is asked.
    const offer =
      event.seriesId && !detach
        ? this.#offerSeries({
            ref,
            seriesId: event.seriesId,
            title: after.title,
            fields: after,
            previousStart: before.start,
            previousEnd: before.end,
          })
        : null;

    if (!(await this.#writeFields(ref, event, after))) {
      this.#withdrawSeries(offer);
      return;
    }

    this.history.push({
      undo: () => this.#writeFields(ref, event, before),
      redo: () => this.#writeFields(ref, event, after),
    });
  }

  retimeEvent(event: CalendarEvent, start: Date, end: Date, detach = false) {
    return this.editEvent(event, { start, end }, detach);
  }

  /** The offered series-wide write actually goes out — see `seriesPrompt`. */
  async applyToSeries() {
    const prompt = this.seriesPrompt;
    if (!prompt) return;
    this.seriesPrompt = null;
    const fields = prompt.patch ?? {
      title: prompt.fields.title,
      description: prompt.fields.description ?? "",
      start: prompt.fields.start.toISOString(),
      end: prompt.fields.end.toISOString(),
    };
    await this.#run(() =>
      updateCalendarEvent(prompt.ref.id, {
        calendarId: prompt.ref.calendarId,
        ...fields,
        seriesId: prompt.seriesId,
        previousStart: prompt.previousStart.toISOString(),
        previousEnd: prompt.previousEnd.toISOString(),
      }),
    );
    // A rule reshapes the whole series: the week is asked again rather than patched by hand.
    if (prompt.patch?.recurrence !== undefined) invalidate.calendar();
  }

  /**
   * The rest of what a card can change — where it is, its zone, how it repeats, who is coming,
   * its reminders, its call. One write, drawn ahead where it can be; the caller says what the
   * write back would be. A rule always lands on the series' master, since a rule is the series';
   * anything else edited on an occurrence is offered to the rest of the series the way a retitle is.
   */
  async patchEvent(event: CalendarEvent, patch: EventPatch, inverse: EventPatch) {
    this.seriesPrompt = null;
    if (this.isDraft(event.id)) {
      diagnostics.report("Calendar", "The block is still being made.", { title: "Give it a second" });
      return;
    }
    const ref = this.#ref(event);
    const onMaster = event.seriesId && patch.recurrence !== undefined;
    const series = onMaster
      ? {
          seriesId: event.seriesId ?? "",
          previousStart: event.start,
          previousEnd: event.end,
        }
      : {};
    const write = (fields: EventPatch) =>
      this.#run(
        () => updateCalendarEvent(ref.id, { calendarId: ref.calendarId, ...fields, ...series }),
        { id: ref.id, event: drawnWith(event, fields) },
        (answer) => applyCalendarEvent(answer, ref.id),
      );
    const offer =
      event.seriesId && !onMaster
        ? this.#offerSeries({
            ref,
            seriesId: event.seriesId,
            title: event.title,
            fields: {
              title: event.title,
              description: event.description,
              start: new Date(event.start),
              end: new Date(event.end),
            },
            previousStart: new Date(event.start),
            previousEnd: new Date(event.end),
            patch,
          })
        : null;

    if ((await write(patch)) === null) {
      this.#withdrawSeries(offer);
      return;
    }

    if (patch.recurrence !== undefined) invalidate.calendar();
    this.history.push({
      undo: async () => (await write(inverse)) !== null,
      redo: async () => (await write(patch)) !== null,
    });
  }

  /** Every offer is its own card — see `SeriesPrompt.id`. */
  #offerSeries(prompt: Omit<SeriesPrompt, "id">) {
    const offered: SeriesPrompt = { ...prompt, id: ++this.#seriesPrompts };
    this.seriesPrompt = offered;
    return offered;
  }

  /** The write it was asking about never landed, so neither does the question. */
  #withdrawSeries(offer: SeriesPrompt | null) {
    if (offer && this.seriesPrompt?.id === offer.id) this.seriesPrompt = null;
  }

  /** Just this occurrence, then — the write already happened, so there's nothing left to do. */
  dismissSeriesPrompt() {
    this.seriesPrompt = null;
  }

  /** Second thoughts about the occurrence itself: the offer goes, and so does the edit behind it. */
  undoSeriesEdit() {
    this.seriesPrompt = null;
    return this.undo();
  }

  async deleteEvent(event: CalendarEvent) {
    this.seriesPrompt = null;
    this.deselect();
    const ref = this.#ref(event);
    if (!(await this.#remove(ref))) return;

    this.history.push({
      undo: () => this.#restore(ref, event),
      redo: () => this.#remove(ref),
    });
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
    this.seriesPrompt = null;
    const attempts = await Promise.all(steps.map((step) => step.redo().then((done) => (done ? step : null))));
    const done = attempts.filter((step): step is HistoryStep => step !== null);
    if (done.length === 0) return;

    this.history.push({
      undo: () => runAll(done, "undo"),
      redo: () => runAll(done, "redo"),
    });
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

  /**
   * The event as the last write left it: the weeks with the drawn-ahead versions over the top,
   * and deliberately not `events`, which also carries the times the editor is previewing. A diff
   * taken against a preview finds nothing to write — and what it found nothing to write for is
   * the very write the preview was leading up to.
   */
  #written(id: string): CalendarEvent | undefined {
    if (this.#pending.has(id)) return this.#pending.get(id) ?? undefined;
    return this.weeks.flatMap((week) => week.value?.events ?? []).find((event) => event.id === id);
  }

  async #writeFields(ref: EventRef, was: CalendarEvent, fields: EventFields): Promise<boolean> {
    // Only what actually moved. A write that carries the title along with a new end time is a
    // write of the title as far as the calendar and everyone else reading it is concerned, and
    // two edits racing over one field are only a race if both of them name that field.
    const base = this.#written(ref.id) ?? was;
    const patch: {
      title?: string;
      description?: string;
      start?: string;
      end?: string;
    } = {};
    if (fields.title !== base.title) patch.title = fields.title;
    // An empty string is how the calendar is told the notes are gone; leaving it out keeps them.
    const description = fields.description ?? "";
    if (description !== (base.description ?? "")) patch.description = description;
    if (fields.start.getTime() !== new Date(base.start).getTime()) patch.start = fields.start.toISOString();
    if (fields.end.getTime() !== new Date(base.end).getTime()) patch.end = fields.end.toISOString();
    // Nothing to say. An undo of an edit that was itself a no-op lands here, as does the editor
    // committing a field the grid already moved.
    if (Object.keys(patch).length === 0) return true;

    const done = await this.#run(
      () => updateCalendarEvent(ref.id, { calendarId: ref.calendarId, ...patch }),
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
      (event) => applyCalendarEvent(event, ref.id),
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
    purpose?: Purpose,
  ): Promise<boolean> {
    // Read when the write is actually sent: an event put back by an undo is a new event by then.
    const target = () => ({
      calendarId: ref.calendarId,
      externalEventId: scope === "series" && was.seriesId ? was.seriesId : ref.id,
      scope,
    });
    const activity = activities.all.find((a) => a.id === choice?.activityId) ?? null;
    // Untagged with the mapping: what an hour was for is a fact about what it counted as.
    const kept = choice ? (purpose ?? purposeOf(was)) : NO_PURPOSE;
    const restyle = (event: CalendarEvent): CalendarEvent => ({
      ...event,
      mappingScope: choice ? scope : null,
      activityId: choice?.activityId ?? null,
      activityName: choice ? (activity?.name ?? null) : null,
      weights: choice ? (choice.weights ?? activity?.weights ?? []) : [],
      ...kept,
    });
    const drawn: Drawn[] =
      scope === "instance"
        ? [
            {
              id: ref.id,
              event: restyle({
                ...was,
                id: ref.id,
                calendarId: ref.calendarId,
              }),
            },
          ]
        : was.seriesId
          ? this.events
              .filter((event) => event.seriesId === was.seriesId)
              .map((event) => ({ id: event.id, event: restyle(event) }))
          : [];

    const done = await this.#run<unknown>(
      () => (choice ? saveEventMapping({ ...target(), ...choice, ...(purpose ?? {}) }) : removeEventMapping(target())),
      drawn,
      // What an instance now counts as is worked out here in full, so the answer is already on
      // the screen — there is nothing to ask the server for. A series recolours instances this
      // strip has never loaded, which only a refetch can know about.
      scope === "instance" ? () => drawn[0]?.event && applyCalendarEvent(drawn[0].event) : undefined,
    );
    return done !== null;
  }

  async #remove(ref: EventRef): Promise<boolean> {
    const done = await this.#run(
      () => deleteCalendarEvent(ref.id, ref.calendarId),
      { id: ref.id, event: null },
      () => dropCalendarEvent(ref.id),
    );
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
        return createCalendarEvent({
          ...mappingFieldsOf(was),
          calendarId: was.calendarId,
          title: was.title,
          description: was.description ?? undefined,
          start: was.start,
          end: was.end,
        });
      },
      { id: ref.id, event: { ...was, id: ref.id, calendarId: ref.calendarId } },
      (event) => applyCalendarEvent(event, ref.id),
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
  async #create(source: DragSource | null, title: string, start: Date, end: Date, openAt: DOMRect | null = null) {
    const activityId = source?.activityId ?? null;
    const activity = activities.all.find((a) => a.id === activityId) ?? null;
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
      movable: true,
      countsTowardHours: true,
      url: null,
      mappingScope: source ? "instance" : null,
      activityId,
      activityName: activity?.name ?? null,
      weights: activity?.weights ?? source?.weights ?? [],
      ...NOT_A_MEETING,
      projectId: source?.projectId ?? null,
      taskId: source?.taskId ?? null,
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
          weights: source && !activityId ? source.weights : undefined,
          projectId: source?.projectId ?? undefined,
          taskId: source?.taskId ?? undefined,
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
      (event) => applyCalendarEvent(event, draft.id),
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
    this.history.push({
      undo: () => this.#remove(ref),
      redo: () => this.#restore(ref, created),
    });
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
          ...mappingFieldsOf(was),
          title: was.title,
          description: was.description ?? undefined,
          start: start.toISOString(),
          end: end.toISOString(),
        });
        await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
        return event;
      },
      { id: draft.id, event: draft },
      (event) => applyCalendarEvent(event, draft.id),
    );
    if (!created) return;

    const ref = this.#ref(created);
    this.history.push({
      undo: () => this.#remove(ref),
      redo: () => this.#restore(ref, created),
    });
  }

  /**
   * Every write puts its answer on the grid first and asks the server second, and the server's
   * own answer to that write is what the week ends up holding — not a refetch of the week.
   *
   * A refetch would be three requests for three weeks of events to learn about one block the
   * answer already described, and Google will happily serve a read with the version from before
   * the write it has just accepted, so the refetched week is not even reliably newer. What the
   * write returns is: it goes into the caches through `apply`, and the drawn-ahead version comes
   * off in the same turn, so the block never blinks.
   *
   * Writes whose reach this screen can't work out — a series edit, a series mapping — pass no
   * `apply` and refetch instead. A write that failed rolls back to what the caches already hold,
   * which is the version from before it was drawn, and marks the weeks worth checking later.
   *
   * The asking is one at a time. Two writes to the same event in flight together land in whichever
   * order Google gets to them, and undoing three edits in a second is exactly that case.
   */
  #run<T>(action: () => Promise<T>, drawn?: Drawn | readonly Drawn[], apply?: (answer: T) => void): Promise<T | null> {
    const drawnList = drawn ? (Array.isArray(drawn) ? drawn : [drawn]) : [];
    // Drawn now, before anything is queued: this is the whole point of drawing ahead. Holding
    // ⌘Z stacks its answers up on the grid at once and lets the writes catch up behind them.
    const token = Symbol("write");
    for (const one of drawnList) {
      this.#pending.set(one.id, one.event);
      this.#drawnBy.set(one.id, token);
    }
    /** Whether this write's version of the block is still the one on screen — see `#drawnBy`. */
    const current = () => drawnList.length > 0 && drawnList.every((one) => this.#drawnBy.get(one.id) === token);

    const run = this.#queue.then(async () => {
      // What the write answered, kept so the step that recorded it can be run backwards later.
      let answer: T | null = null;
      let saved = false;
      try {
        answer = await action();
        saved = true;
      } catch (e) {
        diagnostics.report("Calendar", e, { title: "That didn’t save" });
      }
      try {
        if (!saved) {
          // The caches still hold what the server had before this was drawn, so taking the drawn
          // version off is the whole rollback. They're marked stale in case the write landed
          // anyway and only the answer was lost.
          invalidate.calendar();
        } else if (apply) {
          apply(answer as T);
        } else {
          invalidate.calendar();
          await this.refreshWeeks();
        }
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

  // --- pointer geometry -----------------------------------------------------

  #arm(input: {
    kind: DragKind;
    source: DragSource | null;
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
      source: input.source,
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
    this.#grabEdgeMinutes = 0;

    if (pending.kind === "create" && pending.source) {
      const dayIndex = daysBetween(this.stripStart, this.windowStart);
      this.drag = {
        kind: "create",
        title: pending.source.title,
        weights: pending.source.weights,
        activityId: pending.source.activityId,
        source: pending.source,
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

    // A resize grabs its edge the same way: the band is a strip, so remember where inside it the
    // press landed and move the edge by what the pointer travels rather than to where it sits.
    if (pending.kind === "resize" || pending.kind === "resize-start") {
      const origin = this.#edgeAt({ clientX: pending.originX, clientY: pending.originY }, day);
      if (origin !== null) this.#grabEdgeMinutes = (pending.kind === "resize" ? endMinutes : startMinutes) - origin;
    }

    // A move grabs the block wherever the pointer landed on it, not its top-left corner —
    // remember the gap so the block doesn't jump to put that corner under the pointer once
    // dragging starts.
    if (pending.kind === "move") {
      const origin = this.#pointerToSlot({
        clientX: pending.originX,
        clientY: pending.originY,
      } as PointerEvent);
      if (origin) {
        this.#grabOffsetMinutes = startMinutes - origin.rawMinutes;
        this.#grabOffsetDays = dayIndex - origin.rawIndex;
      }
    }

    // Dragging one of the gathered blocks drags the lot: the others keep their distance from it,
    // so a batch moves as the shape it already was. Anything that can't be moved stays put.
    const others = this.picked.has(pending.event.id)
      ? this.pickedEvents.filter((event) => event.id !== pending.event?.id && event.movable && !event.allDay)
      : [];

    this.drag = {
      kind: pending.kind,
      title: pending.event.title,
      weights: pending.event.weights,
      activityId: pending.event.activityId,
      source: null,
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
    return (
      at && {
        dayIndex: at.dayIndex,
        minutes: clamp(at.minutes, 0, MINUTES_PER_DAY),
      }
    );
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
    return {
      day: addDays(this.stripStart, index),
      index,
      minutes: snapMinutes(rawMinutes),
      rawMinutes,
      rawIndex,
    };
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
    const minutes = at.minutes + this.#grabEdgeMinutes;
    return {
      minutes: this.#insideStrip(column, snapMinutes(minutes), anchor),
      rawMinutes: this.#insideStrip(column, minutes, anchor),
    };
  }

  /** Where the pointer reads as an edge on `day`, before any grab offset — see `#grabEdgeMinutes`. */
  #edgeAt(e: { clientX: number; clientY: number }, day: Date): number | null {
    const at = this.#pointerToRaw(e);
    if (!at) return null;
    const column = clamp(Math.floor(at.dayIndex), 0, STRIP_DAYS - 1);
    return this.#insideStrip(column, at.minutes, daysBetween(this.stripStart, day));
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
    purpose: purposeOf(event),
  };
}

/** One purpose at a time: a task belongs to a project, and a project is not a practice. */
function mergePurpose(was: Purpose, change: Partial<Purpose>): Purpose {
  const merged = { ...was, ...change };
  if (change.practiceId)
    return {
      ...merged,
      projectId: null,
      taskId: null,
      practiceId: change.practiceId,
    };
  if (change.projectId === null) return { ...merged, taskId: null };
  if (change.projectId || change.taskId) return { ...merged, practiceId: null };
  return merged;
}

function purposeOf(event: CalendarEvent): Purpose {
  return {
    projectId: event.projectId,
    practiceId: event.practiceId,
    taskId: event.taskId,
    timer: event.timer,
    source: event.source,
  };
}

/** A copy or a restore counts as, and is for, what the original was — in the create itself. */
function mappingFieldsOf(was: CalendarEvent) {
  return {
    activityId: was.activityId ?? undefined,
    weights: !was.activityId && was.mappingScope === "instance" && was.weights.length > 0 ? was.weights : undefined,
    projectId: was.projectId ?? undefined,
    practiceId: was.practiceId ?? undefined,
    taskId: was.taskId ?? undefined,
    timer: was.timer ?? undefined,
    source: was.source ?? undefined,
  };
}

/**
 * Which Google account a calendar came from, as an address — the one thing a Google link needs to
 * open in the right place when the browser is signed into more than one. Null while the calendar
 * list hasn't loaded, or for a calendar no account claims.
 */
export function accountEmailOf(calendarId: string) {
  const prefs = store.calendars.value;
  if (!prefs) return null;
  const account = (prefs.accounts ?? []).find((a) => a.calendars.some((c) => c.id === calendarId));
  return account?.email ?? null;
}

/** The caches for the three weeks drawn from `start`, made if the store hasn't got them yet. */
function stripWeeksFrom(start: Date) {
  return Array.from({ length: STRIP_WEEKS }, (_, i) => calendarWeek(weekKey(addDays(start, i * DAYS_PER_WEEK))));
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export const calendarData = new CalendarData();
