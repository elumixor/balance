import { clamp } from "$lib/core/math";
import type { ActivityWeight } from "$lib/core/records";
import { addDays, daysBetween, MINUTES_PER_DAY, startOfDay } from "./dates";
import type { Move } from "./edits.svelte";
import { edgeAt, insideStrip, instantAt, pointerToEdge, pointerToPoint, pointerToSlot, STRIP_DAYS } from "./geometry";
import type { CalendarSelection } from "./selection.svelte";
import type { CalendarEvent } from "./types";
import { DEFAULT_EVENT_MINUTES, SNAP_MINUTES, segmentsForRange, snapMinutes } from "./week-grid";

/** How far a finger has to travel before a tap becomes a drag, and how long before a hold does. */
const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 350;
/**
 * How long a finger has to stay still before the grid takes the gesture off the browser. Travelling
 * can't be what starts a drag on a touch screen — that same movement is how the week is scrolled,
 * and the two can't both have it — so on a finger every drag begins with a hold, and a press that
 * moves before the hold has fired is a scroll the browser keeps.
 */
const TOUCH_HOLD_MS = 450;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 12;

/** How close together, in time and on screen, two taps on empty grid have to be to count as one. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 24;

export type DragKind = "create" | "move" | "resize" | "resize-start";

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
  /** A finger rather than a mouse: it holds to begin, and travelling drops the press. */
  readonly touch: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  armed: boolean;
}

/** What a drag reads from the screen it moves things on, and the writes a drop turns into. */
export interface DragHost {
  readonly stripStart: Date;
  readonly windowStart: Date;
  readonly events: readonly CalendarEvent[];
  readonly pickedEvents: readonly CalendarEvent[];
  readonly connected: boolean;
  create(source: DragSource | null, title: string, start: Date, end: Date, openAt?: DOMRect | null): Promise<unknown>;
  copyEvents(moves: readonly Move[]): Promise<unknown>;
  retimeEvents(moves: readonly Move[]): Promise<unknown>;
  retimeEvent(event: CalendarEvent, start: Date, end: Date, detach: boolean): Promise<unknown>;
}

/**
 * Where every drop of a drag lands: the dragged block where it was let go, and every other
 * gathered block moved by the same distance. A resize drags one edge, so the others' starts stay
 * put and only their ends follow.
 */
export function dropMoves(drag: DragState, start: Date, end: Date): Move[] {
  const was = drag.event;
  if (!was) return [];
  const shiftStart = start.getTime() - new Date(was.start).getTime();
  const shiftEnd = end.getTime() - new Date(was.end).getTime();
  const moving = drag.kind === "resize" ? 0 : shiftStart;
  return [
    { event: was, start, end },
    ...drag.others.map((event) => ({
      event,
      start: new Date(new Date(event.start).getTime() + moving),
      end: new Date(new Date(event.end).getTime() + shiftEnd),
    })),
  ];
}

/**
 * Everything the pointer does to the grid: a chip dragged in, a block moved or resized, a box
 * drawn over empty grid, a double tap on it. A press is armed first and only becomes a drag once
 * it has travelled or been held, so a tap stays a tap.
 */
export class CalendarDrag {
  state = $state<DragState | null>(null);
  /** The box being dragged over empty grid right now, if any. */
  marquee = $state<MarqueeState | null>(null);
  /** The whole 21-day strip, registered by the grid so the palette can hit-test against it. */
  columnsEl = $state<HTMLElement | undefined>(undefined);
  scrollerEl = $state<HTMLElement | undefined>(undefined);

  #pending: PendingDrag | null = null;
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
  /** A finger held still on empty grid, waiting to become a block — see `beginMarquee`. */
  #holdTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether a started touch drag is currently refusing the scroll — see `#holdScroll`. */
  #scrollHeld = false;
  /** Refuses the scroll the rest of a started touch drag would otherwise be — see `#start`. */
  readonly #refuseScroll = (e: TouchEvent) => e.preventDefault();
  /** The last tap on empty grid, which the next one is measured against — see `tapEmpty`. */
  #lastTap: { x: number; y: number; at: number } | null = null;
  readonly #host: DragHost;
  readonly #selection: CalendarSelection;

  constructor(host: DragHost, selection: CalendarSelection) {
    this.#host = host;
    this.#selection = selection;
  }

  /** Whether the press that's ending moved something — a click after a real drag isn't a tap. */
  get dragged() {
    return this.#dragged;
  }

  /** A palette chip: a tap opens the thing, so the drag only starts once the finger moves. */
  beginCreate(source: DragSource, e: PointerEvent) {
    this.#arm({ kind: "create", source, event: null, e, armed: false });
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
    const pending = this.#pending;
    if (pending && !pending.armed) {
      const travelled = Math.hypot(e.clientX - pending.originX, e.clientY - pending.originY);
      if (travelled < DRAG_THRESHOLD_PX) return;
      // A finger that has travelled before its hold fired is scrolling the week rather than
      // moving anything: the press is dropped, and the browser keeps the gesture it started.
      if (pending.touch) return this.#cancelPending();
      this.#start(pending);
    }
    const drag = this.state;
    const box = this.columnsEl?.getBoundingClientRect();
    if (!drag || !box) return;

    this.#autoscrollNear(e.clientY);
    if (drag.kind === "move") drag.copy = e.altKey;

    // An edge follows the pointer into whatever column it's over, counted from the block's own
    // start day, so dragging sideways as well as down grows the block across midnight.
    if (drag.kind === "resize" || drag.kind === "resize-start") {
      const edge = pointerToEdge(box, e, this.#host.stripStart, drag.day, this.#grabEdgeMinutes);
      if (drag.kind === "resize") {
        drag.endMinutes = Math.max(drag.startMinutes + SNAP_MINUTES, edge.minutes);
        drag.freeEndMinutes = Math.max(drag.startMinutes + SNAP_MINUTES, edge.rawMinutes);
      } else {
        drag.startMinutes = Math.min(drag.endMinutes - SNAP_MINUTES, edge.minutes);
        drag.freeStartMinutes = Math.min(drag.endMinutes - SNAP_MINUTES, edge.rawMinutes);
      }
      return;
    }
    // A move keeps its length, however many days that is. The block hangs off the column it's over
    // rather than being tucked back inside it, so dragging it through midnight — off the foot of
    // one day and into the head of the next — moves it a day just as dragging sideways does.
    const at = pointerToSlot(box, e, this.#host.stripStart, {
      days: this.#grabOffsetDays,
      minutes: this.#grabOffsetMinutes,
    });
    const length = drag.endMinutes - drag.startMinutes;
    drag.day = at.day;
    drag.startMinutes = insideStrip(at.index, at.minutes, at.index, length);
    drag.endMinutes = drag.startMinutes + length;
    drag.freeStartMinutes = insideStrip(at.index, at.rawMinutes, at.index, length);
    drag.freeEndMinutes = drag.freeStartMinutes + length;
    drag.freeDayIndex = at.rawIndex;
  }

  /** Alt pressed or released mid-drag, ahead of the next pointer move — see `moveDrag`. */
  setDragCopy(copy: boolean) {
    if (this.state?.kind === "move") this.state.copy = copy;
  }

  /**
   * `detach` is ⌘/Ctrl held at the moment of release: it means the occurrence is meant to come
   * loose from its series on purpose, so the usual after-the-fact "apply to the series?" offer is
   * skipped rather than asked and declined.
   */
  endDrag(e?: { metaKey: boolean; ctrlKey: boolean }) {
    this.#cancelPending();
    this.#stopAutoscroll();
    this.#releaseScroll();
    const drag = this.state;
    this.state = null;
    if (!drag) return;

    const start = instantAt(drag.day, drag.startMinutes);
    const end = instantAt(drag.day, drag.endMinutes);
    const detach = Boolean(e?.metaKey || e?.ctrlKey);

    if (drag.kind === "create" && drag.source) void this.#host.create(drag.source, drag.title, start, end);
    else if (drag.event && drag.copy) void this.#host.copyEvents(dropMoves(drag, start, end));
    else if (drag.event && drag.others.length > 0) void this.#host.retimeEvents(dropMoves(drag, start, end));
    else if (drag.event) void this.#host.retimeEvent(drag.event, start, end, detach);
  }

  /**
   * A box dragged over empty grid gathers what it touches. Only where there's nothing already —
   * over a block the same press moves it — and only with a mouse: a finger dragging the grid is
   * scrolling it, which is how the week changes.
   *
   * A finger held still there makes an hour instead, the way a mouse's two taps do — the one way
   * onto the week that doesn't start at the palette, and the only one a finger can ask for without
   * the scroll taking the second tap. Travelling first cancels it, and the week scrolls as it was.
   */
  beginMarquee(e: PointerEvent) {
    // Every press on the grid is measured, mouse or finger: it's what tells a tap from a drag.
    this.#pressAt = { x: e.clientX, y: e.clientY };
    if ((e.target as Element | null)?.closest("[data-event]")) return;
    if (e.pointerType === "touch") {
      const at = { clientX: e.clientX, clientY: e.clientY };
      this.#holdTimer = setTimeout(() => {
        this.#holdTimer = null;
        this.#pressAt = null;
        void this.#createAt(at);
      }, TOUCH_HOLD_MS);
      return;
    }
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const box = this.columnsEl?.getBoundingClientRect();
    if (!box) return;
    const at = pointerToPoint(box, e);

    e.preventDefault();
    this.#selection.deselect();
    if (!e.shiftKey) this.#selection.clearPicked();
    this.#pickedBeforeMarquee = new Set(this.#selection.picked);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    this.marquee = {
      fromDay: at.dayIndex,
      fromMinutes: at.minutes,
      toDay: at.dayIndex,
      toMinutes: at.minutes,
    };
  }

  moveMarquee(e: PointerEvent) {
    // A finger that has travelled is scrolling the week, so the block its hold would have made is
    // no longer what the press means.
    const press = this.#pressAt;
    if (this.#holdTimer && press && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= DRAG_THRESHOLD_PX) {
      this.#cancelHold();
    }
    const marquee = this.marquee;
    const box = this.columnsEl?.getBoundingClientRect();
    if (!marquee || !box) return;
    const at = pointerToPoint(box, e);
    marquee.toDay = at.dayIndex;
    marquee.toMinutes = at.minutes;
    this.#gather(marquee);
  }

  endMarquee() {
    this.#cancelHold();
    this.marquee = null;
  }

  /**
   * Drops whatever the pointer had started — a pending or running drag, a gathering box — without
   * applying any of it. A pinch is what calls this: its first finger looks exactly like the start
   * of a drag, and the block must not move because the second finger arrived.
   */
  abortGesture() {
    this.#cancelPending();
    this.#cancelHold();
    this.#stopAutoscroll();
    this.#releaseScroll();
    this.#pressAt = null;
    this.state = null;
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
    if (!press || this.state || !this.#host.connected) return;
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

  /**
   * An hour at the pressed slot, opened beside the pointer as soon as it has an id to be named by.
   * Two taps ask for it with a mouse, a held finger with a touch, so the guards are here rather
   * than on either way in.
   */
  #createAt(e: { clientX: number; clientY: number }) {
    const box = this.columnsEl?.getBoundingClientRect();
    if (!box || this.state || !this.#host.connected) return;
    const at = pointerToPoint(box, e);
    const day = addDays(this.#host.stripStart, clamp(Math.floor(at.dayIndex), 0, STRIP_DAYS - 1));
    const minutes = clamp(snapMinutes(at.minutes), 0, MINUTES_PER_DAY - DEFAULT_EVENT_MINUTES);

    this.#selection.deselect();
    this.#selection.clearPicked();
    // Untitled: the editor opens on it with the cursor in the name, which is where the name comes
    // from — a placeholder would only be something to delete first.
    return this.#host.create(
      null,
      "",
      instantAt(day, minutes),
      instantAt(day, minutes + DEFAULT_EVENT_MINUTES),
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
    for (const segment of segmentsForRange(this.#host.events, this.#host.stripStart, STRIP_DAYS)) {
      const overlapsDay = segment.dayIndex + 1 > fromDay && segment.dayIndex < toDay;
      const overlapsTime = segment.endMinutes > fromMinutes && segment.startMinutes < toMinutes;
      if (overlapsDay && overlapsTime) hit.add(segment.event.id);
    }
    // Shift-dragging adds to what was already gathered; a plain drag cleared it on the way in.
    const picked = this.#selection.picked;
    for (const id of hit) picked.add(id);
    for (const id of [...picked]) if (!hit.has(id) && !this.#pickedBeforeMarquee.has(id)) picked.delete(id);
  }

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
    const touch = input.e.pointerType === "touch";
    // Otherwise a press-drag across a title selects its text instead of moving the block. Never on
    // a finger: until the hold has fired the gesture is still the browser's, and a press that has
    // already swallowed its own default is a week that won't scroll.
    if (!touch) input.e.preventDefault();
    this.#dragged = false;
    const pending: PendingDrag = {
      kind: input.kind,
      el: input.e.currentTarget as Element,
      touch,
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
    //
    // A finger needs none of it: a touch pointer is already captured to the element it landed on,
    // and claiming it here would be claiming a gesture that may still turn out to be a scroll.
    if (!touch) pending.el.setPointerCapture?.(input.e.pointerId);
    // Every drag a finger makes begins with a hold, since travelling is how the week is scrolled;
    // a mouse only holds where a nudge would already mean something else.
    if (touch) pending.timer = setTimeout(() => this.#start(pending), TOUCH_HOLD_MS);
    else if (input.longPress) pending.timer = setTimeout(() => this.#start(pending), LONG_PRESS_MS);
    this.#pending = pending;
    if (input.armed) this.#start(pending);
  }

  #start(pending: PendingDrag) {
    if (this.state || pending.locked) return;
    pending.armed = true;
    this.#dragged = true;
    if (pending.timer) clearTimeout(pending.timer);
    // The hold has fired, so the block moves rather than the week. The finger has been still up to
    // now, so nothing has begun to scroll yet — and refusing the moves from here is the only way to
    // keep it that way, since `touch-action` is read when the touch lands and can't be changed after.
    if (pending.touch) {
      pending.el.setPointerCapture?.(pending.pointerId);
      this.#holdScroll();
    }

    this.#grabOffsetMinutes = 0;
    this.#grabOffsetDays = 0;
    this.#grabEdgeMinutes = 0;
    const stripStart = this.#host.stripStart;

    if (pending.kind === "create" && pending.source) {
      const windowStart = this.#host.windowStart;
      this.state = {
        kind: "create",
        title: pending.source.title,
        weights: pending.source.weights,
        activityId: pending.source.activityId,
        source: pending.source,
        event: null,
        copy: false,
        others: [],
        day: windowStart,
        startMinutes: 0,
        endMinutes: DEFAULT_EVENT_MINUTES,
        freeStartMinutes: 0,
        freeEndMinutes: DEFAULT_EVENT_MINUTES,
        freeDayIndex: daysBetween(stripStart, windowStart),
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
    const dayIndex = daysBetween(stripStart, day);
    const box = this.columnsEl?.getBoundingClientRect();
    const origin = { clientX: pending.originX, clientY: pending.originY };

    // A resize grabs its edge the same way: the band is a strip, so remember where inside it the
    // press landed and move the edge by what the pointer travels rather than to where it sits.
    if (box && (pending.kind === "resize" || pending.kind === "resize-start")) {
      const edge = edgeAt(box, origin, stripStart, day);
      this.#grabEdgeMinutes = (pending.kind === "resize" ? endMinutes : startMinutes) - edge;
    }

    // A move grabs the block wherever the pointer landed on it, not its top-left corner —
    // remember the gap so the block doesn't jump to put that corner under the pointer once
    // dragging starts.
    if (box && pending.kind === "move") {
      const slot = pointerToSlot(box, origin, stripStart, { days: 0, minutes: 0 });
      this.#grabOffsetMinutes = startMinutes - slot.rawMinutes;
      this.#grabOffsetDays = dayIndex - slot.rawIndex;
    }

    // Dragging one of the gathered blocks drags the lot: the others keep their distance from it,
    // so a batch moves as the shape it already was. Anything that can't be moved stays put.
    const others = this.#selection.picked.has(pending.event.id)
      ? this.#host.pickedEvents.filter((event) => event.id !== pending.event?.id && event.movable && !event.allDay)
      : [];

    this.state = {
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
    if (this.#pending?.timer) clearTimeout(this.#pending.timer);
    this.#pending = null;
  }

  #cancelHold() {
    if (this.#holdTimer) clearTimeout(this.#holdTimer);
    this.#holdTimer = null;
  }

  #holdScroll() {
    if (this.#scrollHeld) return;
    this.#scrollHeld = true;
    // Not passive: the whole point is to take the rest of the gesture off the browser.
    document.addEventListener("touchmove", this.#refuseScroll, { passive: false });
  }

  #releaseScroll() {
    if (!this.#scrollHeld) return;
    this.#scrollHeld = false;
    document.removeEventListener("touchmove", this.#refuseScroll);
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
