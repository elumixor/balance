import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { addDays, DAYS_PER_WEEK, MINUTES_PER_DAY, weekKey, weekStartFromKey } from "$lib/dates";
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
  dayIndex: number;
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
  actionError = $state<string | null>(null);
  drag = $state<DragState | null>(null);

  /** The 7-column area, registered by the grid so the palette can hit-test against it. */
  columnsEl = $state<HTMLElement | undefined>(undefined);
  scrollerEl = $state<HTMLElement | undefined>(undefined);

  #pending: PendingDrag | null = null;
  #autoscroll: number | null = null;

  readonly key = $derived(weekKey(this.anchor));
  readonly weekStart = $derived(weekStartFromKey(this.key));
  readonly week = $derived(calendarWeek(this.key));
  readonly events = $derived(this.week.value?.events ?? []);
  readonly connected = $derived(this.week.value?.connected ?? store.integrations.value?.[0]?.connected ?? false);
  readonly needsReconnect = $derived(this.week.value?.needsReconnect ?? false);
  readonly isThisWeek = $derived(this.key === weekKey(new Date()));

  enter() {
    return Promise.all([
      store.categories.ensure(),
      store.activities.ensure(),
      store.integrations.ensure(),
      this.week.ensure(),
    ]);
  }

  goToWeek(offset: number) {
    this.anchor = addDays(this.weekStart, offset * DAYS_PER_WEEK);
    void this.week.ensure();
  }

  goToToday() {
    this.anchor = new Date();
    void this.week.ensure();
  }

  // --- dragging -------------------------------------------------------------

  /** A palette chip: a tap opens the activity, so the drag only starts once the finger moves. */
  beginCreate(activity: Activity, e: PointerEvent) {
    this.#arm({ kind: "create", activity, event: null, e, armed: false });
  }

  /** A block: a tap opens its sheet, so moving it takes a hold rather than a nudge. */
  beginMove(event: CalendarEvent, e: PointerEvent) {
    if (event.readOnly) return;
    this.#arm({ kind: "move", activity: null, event, e, armed: false, longPress: true });
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
    this.drag.dayIndex = at.dayIndex;
    this.drag.startMinutes = Math.min(at.minutes, MINUTES_PER_DAY - length);
    this.drag.endMinutes = this.drag.startMinutes + length;
  }

  endDrag() {
    this.#cancelPending();
    this.#stopAutoscroll();
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;

    const start = this.#instantAt(drag.dayIndex, drag.startMinutes);
    const end = this.#instantAt(drag.dayIndex, drag.endMinutes);

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

  async renameEvent(event: CalendarEvent, title: string) {
    await this.#run(() => updateCalendarEvent(event.id, { calendarId: event.calendarId, title }));
  }

  async retimeEvent(event: CalendarEvent, start: Date, end: Date) {
    await this.#run(() =>
      updateCalendarEvent(event.id, {
        calendarId: event.calendarId,
        start: start.toISOString(),
        end: end.toISOString(),
      }),
    );
  }

  async deleteEvent(event: CalendarEvent) {
    this.selected = null;
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
      await this.week.refresh();
    } catch (e) {
      this.actionError = e instanceof Error ? e.message : "That didn't save.";
      await this.week.refresh();
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
  }) {
    (input.e.currentTarget as Element).setPointerCapture?.(input.e.pointerId);
    const pending: PendingDrag = {
      kind: input.kind,
      pointerId: input.e.pointerId,
      originX: input.e.clientX,
      originY: input.e.clientY,
      activity: input.activity,
      event: input.event,
      armed: input.armed,
      timer: null,
    };
    if (input.longPress) pending.timer = setTimeout(() => this.#start(pending), LONG_PRESS_MS);
    this.#pending = pending;
    if (input.armed) this.#start(pending);
  }

  #start(pending: PendingDrag) {
    if (this.drag) return;
    pending.armed = true;
    if (pending.timer) clearTimeout(pending.timer);

    if (pending.kind === "create" && pending.activity) {
      this.drag = {
        kind: "create",
        title: pending.activity.name,
        weights: pending.activity.weights,
        activityId: pending.activity.id,
        event: null,
        dayIndex: 0,
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
      dayIndex: Math.floor((start.getTime() - this.weekStart.getTime()) / (24 * 60 * 60 * 1000)),
      startMinutes: start.getHours() * 60 + start.getMinutes(),
      endMinutes: end.getHours() * 60 + end.getMinutes(),
    };
  }

  #cancelPending() {
    if (this.#pending?.timer) clearTimeout(this.#pending.timer);
    this.#pending = null;
  }

  #pointerToSlot(e: PointerEvent): { dayIndex: number; minutes: number } | null {
    if (!this.columnsEl) return null;
    const rect = this.columnsEl.getBoundingClientRect();
    const dayIndex = clamp(Math.floor(((e.clientX - rect.left) / rect.width) * DAYS_PER_WEEK), 0, DAYS_PER_WEEK - 1);
    const minutes = clamp(snapMinutes(((e.clientY - rect.top) / rect.height) * MINUTES_PER_DAY), 0, MINUTES_PER_DAY);
    return { dayIndex, minutes };
  }

  #instantAt(dayIndex: number, minutes: number): Date {
    const at = addDays(this.weekStart, dayIndex);
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export const calendarData = new CalendarData();
