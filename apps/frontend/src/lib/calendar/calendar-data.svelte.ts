import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { SvelteMap } from "svelte/reactivity";
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
import { CalendarHistory } from "./history.svelte";
import { DEFAULT_EVENT_MINUTES, snapMinutes } from "./week-grid";

/** Three weeks of columns, so there's a week to scroll into on either side of the seven shown. */
export const STRIP_DAYS = 3 * DAYS_PER_WEEK;

/** How far a finger has to travel before a tap becomes a drag, and how long before a hold does. */
const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 350;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 12;

/** How many times a write asks the calendar to agree with it before taking no for an answer. */
const SETTLE_ATTEMPTS = 3;
const SETTLE_DELAY_MS = 600;
/** The id a block wears between being drawn and the calendar giving it a real one. */
const DRAFT_PREFIX = "draft:";

export type DragKind = "create" | "move" | "resize";

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
  /** The day the block is over, as a date: the strip runs across weeks, so an index won't do. */
  day: Date;
  startMinutes: number;
  endMinutes: number;
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
  selected = $state<CalendarEvent | null>(null);
  /** Where the tapped block is on screen, so its editor can open beside it rather than over it. */
  selectedRect = $state<DOMRect | null>(null);
  actionError = $state<string | null>(null);
  drag = $state<DragState | null>(null);
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

  #pendingDrag: PendingDrag | null = null;
  /** Whether the press that's ending actually moved something, so its click isn't read as a tap. */
  #dragged = false;
  #autoscroll: number | null = null;

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
   */
  readonly events = $derived.by(() => {
    const byId = new Map(this.weeks.flatMap((week) => week.value?.events ?? []).map((event) => [event.id, event]));
    for (const [id, event] of this.#pending) {
      if (event) byId.set(id, event);
      else byId.delete(id);
    }
    return [...byId.values()];
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

  select(event: CalendarEvent, rect: DOMRect) {
    this.selected = event;
    this.selectedRect = rect;
  }

  /**
   * A block's own click, which arrives on whatever captured the pointer rather than on the button
   * inside it — hence a tap being answered here and not by the block. A press that turned into a
   * real drag still ends in a click, and that one isn't a tap.
   */
  tap(event: CalendarEvent, rect: DOMRect) {
    if (this.#dragged) return;
    this.select(event, rect);
  }

  deselect() {
    this.selected = null;
    this.selectedRect = null;
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
    this.#arm({
      kind: "move",
      activity: null,
      event,
      e,
      armed: false,
      longPress: !event.readOnly,
      locked: event.readOnly,
    });
  }

  beginResize(event: CalendarEvent, e: PointerEvent) {
    if (event.readOnly) return;
    e.stopPropagation();
    this.#arm({ kind: "resize", activity: null, event, e, armed: true });
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

    if (this.drag.kind === "resize") {
      this.drag.endMinutes = Math.max(this.drag.startMinutes + 15, at.minutes);
      return;
    }
    const length = this.drag.endMinutes - this.drag.startMinutes;
    this.drag.day = at.day;
    this.drag.startMinutes = Math.min(at.minutes, MINUTES_PER_DAY - length);
    this.drag.endMinutes = this.drag.startMinutes + length;
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
    else if (drag.event) void this.retimeEvent(drag.event, start, end);
  }

  // --- writes ---------------------------------------------------------------

  /**
   * A whole series recolours every instance of it, which is more than this screen can work out
   * on its own — so only the single-instance case gets to show its answer early.
   */
  async mapEvent(
    event: CalendarEvent,
    scope: MappingScope,
    choice: { activityId?: string; weights?: ActivityWeight[] },
  ) {
    const activity = store.activities.value?.find((a) => a.id === choice.activityId) ?? null;
    await this.#run(
      () =>
        saveEventMapping({
          calendarId: event.calendarId,
          externalEventId: scope === "series" && event.seriesId ? event.seriesId : event.id,
          scope,
          ...choice,
        }),
      scope === "instance"
        ? {
            id: event.id,
            event: {
              ...event,
              mappingScope: "instance",
              activityId: choice.activityId ?? null,
              activityName: activity?.name ?? null,
              weights: choice.weights ?? activity?.weights ?? [],
            },
          }
        : undefined,
    );
  }

  async unmapEvent(event: CalendarEvent) {
    const scope = event.mappingScope ?? "instance";
    await this.#run(
      () =>
        removeEventMapping({
          calendarId: event.calendarId,
          externalEventId: scope === "series" && event.seriesId ? event.seriesId : event.id,
          scope,
        }),
      scope === "instance"
        ? { id: event.id, event: { ...event, mappingScope: null, activityId: null, activityName: null, weights: [] } }
        : undefined,
    );
  }

  /** The editor saves title, notes and times together — one write, so one refetch and one undo. */
  async editEvent(event: CalendarEvent, patch: { title?: string; description?: string; start?: Date; end?: Date }) {
    await this.#run(
      () =>
        updateCalendarEvent(event.id, {
          calendarId: event.calendarId,
          title: patch.title,
          description: patch.description,
          start: patch.start?.toISOString(),
          end: patch.end?.toISOString(),
        }),
      {
        id: event.id,
        event: {
          ...event,
          title: patch.title ?? event.title,
          description: patch.description ?? event.description,
          start: (patch.start ?? new Date(event.start)).toISOString(),
          end: (patch.end ?? new Date(event.end)).toISOString(),
        },
      },
    );
  }

  retimeEvent(event: CalendarEvent, start: Date, end: Date) {
    return this.editEvent(event, { start, end });
  }

  async deleteEvent(event: CalendarEvent) {
    this.deselect();
    await this.#run(() => deleteCalendarEvent(event.id, event.calendarId), { id: event.id, event: null });
  }

  /**
   * A new block has no id until the calendar gives it one, so it's drawn under a made-up one and
   * the real event takes its place when the refetch lands.
   */
  async #create(activityId: string, title: string, start: Date, end: Date) {
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
      mappingScope: "instance",
      activityId,
      activityName: activity?.name ?? title,
      weights: activity?.weights ?? [],
    };
    await this.#run(
      async () => {
        await createCalendarEvent({ activityId, title, start: start.toISOString(), end: end.toISOString() });
        await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
      },
      { id: draft.id, event: draft },
    );
  }

  /**
   * Every write puts its answer on the grid first and asks the server second. The server is still
   * the truth: the week is refetched either way, and the drawn-ahead version is only dropped once
   * that refetch has landed — so a write that failed rolls back to what the server actually holds
   * without a frame of the old value showing in between.
   */
  async #run(action: () => Promise<unknown>, drawn?: Drawn) {
    const id = drawn?.id;
    if (id !== undefined) this.#pending.set(id, drawn?.event ?? null);
    this.actionError = null;
    let saved = false;
    try {
      await action();
      invalidate.calendar();
      saved = true;
    } catch (e) {
      this.actionError = e instanceof Error ? e.message : "That didn't save.";
    }
    try {
      if (saved && drawn) await this.#settle(drawn);
      else await this.refreshWeeks();
    } finally {
      if (id !== undefined) this.#pending.delete(id);
    }
  }

  /**
   * Google will happily answer a read with the version from before the write it just accepted, so
   * refetching once and trusting it is how a block ends up back where it started a second after
   * being moved. The drawn-ahead version stays up until the server's answer matches it, or until
   * asking again stops being worth the wait — at which point what the server says wins anyway.
   */
  async #settle(drawn: Drawn) {
    for (let attempt = 0; ; attempt++) {
      await this.refreshWeeks();
      if (attempt >= SETTLE_ATTEMPTS - 1 || this.#serverAgrees(drawn)) return;
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
  }) {
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
      armed: input.armed,
      timer: null,
    };
    if (input.longPress) pending.timer = setTimeout(() => this.#start(pending), LONG_PRESS_MS);
    this.#pendingDrag = pending;
    if (input.armed) this.#start(pending);
  }

  #start(pending: PendingDrag) {
    if (this.drag || pending.locked) return;
    pending.armed = true;
    this.#dragged = true;
    // Captured only now: a captured pointer sends its click to whatever captured it, which would
    // swallow the tap that opens an event. Nothing to capture for until something is moving.
    pending.el.setPointerCapture?.(pending.pointerId);
    if (pending.timer) clearTimeout(pending.timer);

    if (pending.kind === "create" && pending.activity) {
      this.drag = {
        kind: "create",
        title: pending.activity.name,
        weights: pending.activity.weights,
        activityId: pending.activity.id,
        event: null,
        day: this.windowStart,
        startMinutes: 0,
        endMinutes: DEFAULT_EVENT_MINUTES,
      };
      return;
    }
    if (!pending.event) return;

    const start = new Date(pending.event.start);
    const end = new Date(pending.event.end);
    this.drag = {
      kind: pending.kind,
      title: pending.event.title,
      weights: pending.event.weights,
      activityId: pending.event.activityId,
      event: pending.event,
      day: startOfDay(start),
      startMinutes: start.getHours() * 60 + start.getMinutes(),
      endMinutes: end.getHours() * 60 + end.getMinutes(),
    };
  }

  #cancelPending() {
    if (this.#pendingDrag?.timer) clearTimeout(this.#pendingDrag.timer);
    this.#pendingDrag = null;
  }

  #pointerToSlot(e: PointerEvent): { day: Date; minutes: number } | null {
    if (!this.columnsEl) return null;
    const rect = this.columnsEl.getBoundingClientRect();
    const index = clamp(Math.floor(((e.clientX - rect.left) / rect.width) * STRIP_DAYS), 0, STRIP_DAYS - 1);
    const minutes = clamp(snapMinutes(((e.clientY - rect.top) / rect.height) * MINUTES_PER_DAY), 0, MINUTES_PER_DAY);
    return { day: addDays(this.stripStart, index), minutes };
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
