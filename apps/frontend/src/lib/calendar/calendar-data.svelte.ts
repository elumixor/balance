import { Haptics, ImpactStyle } from "@capacitor/haptics";
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
import { DEFAULT_EVENT_MINUTES, snapMinutes } from "./week-grid";

/** Three weeks of columns, so there's a week to scroll into on either side of the seven shown. */
export const STRIP_DAYS = 3 * DAYS_PER_WEEK;

/** How far a finger has to travel before a tap becomes a drag, and how long before a hold does. */
const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 350;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 12;

export type DragKind = "create" | "move" | "resize";

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
  anchor = $state(new Date());
  selected = $state<CalendarEvent | null>(null);
  /** Where the tapped block is on screen, so its editor can open beside it rather than over it. */
  selectedRect = $state<DOMRect | null>(null);
  actionError = $state<string | null>(null);
  drag = $state<DragState | null>(null);

  /** The whole 21-day strip, registered by the grid so the palette can hit-test against it. */
  columnsEl = $state<HTMLElement | undefined>(undefined);
  scrollerEl = $state<HTMLElement | undefined>(undefined);

  #pending: PendingDrag | null = null;
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

  /** One copy of each event: the ones that straddle Sunday night come back in two weeks' answers. */
  readonly events = $derived([
    ...new Map(this.weeks.flatMap((week) => week.value?.events ?? []).map((event) => [event.id, event])).values(),
  ]);

  /**
   * Seven days always overlap two calendar weeks; the one holding four or more of them is the
   * week the meters and the title are about. Adding three days lands on that week by itself.
   */
  readonly weekStart = $derived(startOfWeek(addDays(this.windowStart, 3)));
  readonly key = $derived(weekKey(this.weekStart));
  readonly week = $derived(calendarWeek(this.key));

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
    const pending = this.#pending;
    if (pending && !pending.armed) {
      const travelled = Math.hypot(e.clientX - pending.originX, e.clientY - pending.originY);
      if (travelled < DRAG_THRESHOLD_PX) return;
      // A hold that turns into a swipe is a scroll, not a move.
      if (pending.kind === "move") return this.#cancelPending();
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

  async mapEvent(
    event: CalendarEvent,
    scope: MappingScope,
    choice: { activityId?: string; weights?: ActivityWeight[] },
  ) {
    await this.#run(() =>
      saveEventMapping({
        calendarId: event.calendarId,
        externalEventId: scope === "series" && event.seriesId ? event.seriesId : event.id,
        scope,
        ...choice,
      }),
    );
  }

  async unmapEvent(event: CalendarEvent) {
    const scope = event.mappingScope ?? "instance";
    await this.#run(() =>
      removeEventMapping({
        calendarId: event.calendarId,
        externalEventId: scope === "series" && event.seriesId ? event.seriesId : event.id,
        scope,
      }),
    );
  }

  /** The editor saves title, notes and times together — one write, so one refetch and one undo. */
  async editEvent(event: CalendarEvent, patch: { title?: string; description?: string; start?: Date; end?: Date }) {
    await this.#run(() =>
      updateCalendarEvent(event.id, {
        calendarId: event.calendarId,
        title: patch.title,
        description: patch.description,
        start: patch.start?.toISOString(),
        end: patch.end?.toISOString(),
      }),
    );
  }

  retimeEvent(event: CalendarEvent, start: Date, end: Date) {
    return this.editEvent(event, { start, end });
  }

  async deleteEvent(event: CalendarEvent) {
    this.deselect();
    await this.#run(() => deleteCalendarEvent(event.id, event.calendarId));
  }

  async #create(activityId: string, title: string, start: Date, end: Date) {
    await this.#run(async () => {
      await createCalendarEvent({ activityId, title, start: start.toISOString(), end: end.toISOString() });
      await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    });
  }

  /** Every write ends the same way: the server is the truth, so the week is refetched from it. */
  async #run(action: () => Promise<unknown>) {
    this.actionError = null;
    try {
      await action();
      invalidate.calendar();
      await this.refreshWeeks();
    } catch (e) {
      this.actionError = e instanceof Error ? e.message : "That didn't save.";
      await this.refreshWeeks();
    }
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
    this.#pending = pending;
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
    if (this.#pending?.timer) clearTimeout(this.#pending.timer);
    this.#pending = null;
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

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export const calendarData = new CalendarData();
