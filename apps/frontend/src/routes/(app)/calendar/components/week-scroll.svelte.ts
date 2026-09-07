import { untrack } from "svelte";
import { calendarData, STRIP_DAYS } from "$lib/calendar/calendar-data.svelte";
import { MS_PER_DAY } from "$lib/calendar/dates";
import { onWheelGesture, wheelGestureActive } from "$lib/calendar/free-scroll";
import { timeScale } from "$lib/calendar/time-scale.svelte";
import { OPENING_HOUR } from "$lib/calendar/week-grid";
import { isDesktop } from "$lib/desktop/platform";
import { theme } from "$lib/ui/theme.svelte";

/** How long the scroll has to sit still before it counts as having landed on a day. */
const SETTLE_MS = 120;
export const JUMP_ANIMATE_MS = 300;
/** A settle is a nudge onto the nearest column, not a journey across the strip. */
const SNAP_ANIMATE_MS = 200;
/**
 * How close to either end of the loaded strip forces a recentre mid-scroll rather than waiting
 * for the scroll to settle, so a fast continuous scroll always has columns ahead of it instead of
 * running into the physical edge of the DOM and stopping dead. It costs the momentum of the fling
 * that triggered it — setting `scrollLeft` ends a fling — which is why it waits until the runway
 * is nearly gone rather than recentring on every column.
 */
const EDGE_DAYS = 3;

const data = calendarData;

/**
 * The week grid's horizontal scroll: where it is, where it is going, and when it has arrived.
 *
 * Twenty-one columns are drawn and `visibleDays` of them fit; coming to rest on a column makes it
 * the first day on screen, and the strip re-centres under it, so the scroll can go on forever in
 * either direction. Everything that writes `scrollLeft` — the opening placement, a jump, the walk
 * back after a recentre, the ease onto a column — lives here, because two writers is how a fling
 * gets stopped dead or a jump lands a week out.
 *
 * Made once by the grid, during its initialisation, so the effects below belong to it; `destroy`
 * is what takes the timers and frames down with it.
 */
export class WeekScroll {
  /** The scroller's box, bound by the grid. */
  viewWidth = $state(0);
  viewHeight = $state(0);

  /** A day column's width: what is left after the hours' gutter, shared between the days on screen. */
  readonly dayWidth: number;

  /**
   * The leftmost column the scroll is over, updated as it moves — unlike `data.dayOffset`, live
   * mid-drag. Whole days rather than pixels: everything reading it only cares which columns are on
   * screen, and a pixel-accurate copy would re-run all of it on every frame of every scroll.
   *
   * Starts where the window already is, not at zero: the first paint happens before the effect
   * that places the scroll, and a zero here would have it draw the columns behind the ones on
   * screen.
   */
  #liveDayOffset = $state(data.dayOffset);
  /** True for the whole today-button jump, so the button stays hidden through the intermediate
   *  scroll states (strip recentre, then the eased animation) instead of flickering back in. */
  #jumping = $state(false);
  /** True while the grid is easing itself onto a column after a gesture. Deliberately not `$state`:
   *  it's a courtesy nudge of a few pixels, not a jump, and nothing on screen should react to it —
   *  the today button used to share `jumping` and so blinked off after every scroll. */
  #snapping = false;
  /** Set when the window is only catching up to where the scroll already is, so the placing effect
   *  leaves the scroll alone instead of writing the position it's already at. */
  #followingScroll = false;
  /**
   * Set by a recentre the scroll's edge forced, and cleared by the first scroll tick that reports a
   * position away from the edge — proof the walk back that came with it actually took. A browser
   * driving a fling of its own (a momentum scroll on iOS, a snap animation in Chromium) keeps
   * writing the position it was heading for over the one walked back to, so the scroll reports
   * the edge again on the very next tick. Landing on that tick moved the window another week,
   * the walk back was overwritten again, and the week ran away seven days a frame — fetching every
   * week it passed — until the fling died. While this is set the edge lands nothing: the scroll
   * meets the strip's physical end instead, and the settle takes it from there.
   */
  #edgeLanded = false;
  /**
   * A Monday-to-Monday jump (today, a month arrow, a tapped date) recentres the strip on the same
   * scroll offset it was already at — nothing about the scroll position itself changes, so easing
   * `scrollLeft` there has nothing to ease. This slides the days off and the new ones in from
   * whichever direction the jump moved, so the swap reads as a scroll rather than a hard cut.
   */
  #easing = $state(false);
  #easeDirection = $state(1);
  /** How far the days start out of place, in pixels: the distance the window actually moved, capped
   *  at a week — past that the columns are all new anyway and further would only slide for longer. */
  #easeDistance = $state(0);

  /** Which strip the current scroll offset was measured against, and whether it's been placed yet. */
  #stripAt: number | null = null;
  /**
   * The first day on screen as of the last placement. The scroll offset can't stand in for it: the
   * strip recentres on every week change, so a jump of one day and a jump of six weeks can both
   * leave `scrollLeft` exactly where it was. This is the only thing that knows which way the window
   * went, and how far.
   */
  #windowAt: number | null = null;
  #opened = false;

  /** The last position the settle's easing wrote, to tell its own ticks from a gesture's. */
  #wrote = 0;
  #settle: ReturnType<typeof setTimeout> | null = null;
  #held: ReturnType<typeof setTimeout> | null = null;
  #jumpFrame: number | null = null;
  #slideFrame: number | null = null;
  #placeFrame: number | null = null;

  constructor(gutterPx: () => number) {
    this.dayWidth = $derived(Math.max(0, this.viewWidth - gutterPx()) / data.visibleDays);
    $effect(() => this.#place());
    $effect(() => this.#walkBack());
    // A new gesture cancels whatever the grid was easing towards, and its end — not the gaps inside
    // it — is what lands the week on a column.
    $effect(() =>
      onWheelGesture({
        start: () => {
          this.#clearSettle();
          this.#cancelAnimation();
        },
        end: () => this.#settleOnColumn(),
      }),
    );
  }

  get liveDayOffset() {
    return this.#liveDayOffset;
  }

  get jumping() {
    return this.#jumping;
  }

  get easing() {
    return this.#easing;
  }

  /** How far the days are drawn out of place right now — see `#easing`. */
  get slidePx() {
    return this.#easing ? this.#easeDirection * this.#easeDistance : 0;
  }

  /** Takes down every timer and frame still pending, so nothing writes to a scroller that is gone. */
  destroy() {
    this.#clearSettle();
    this.#cancelAnimation();
    if (this.#held !== null) clearTimeout(this.#held);
    if (this.#slideFrame !== null) cancelAnimationFrame(this.#slideFrame);
    if (this.#placeFrame !== null) cancelAnimationFrame(this.#placeFrame);
    this.#held = this.#slideFrame = this.#placeFrame = null;
  }

  readonly onscroll = () => {
    const scroller = data.scrollerEl;
    const width = this.dayWidth;
    if (!scroller || width === 0) return;
    const offset = scroller.scrollLeft / width;
    // Whole columns only, so the header and the today button re-run when the day under the left
    // edge changes rather than on every frame of the scroll that gets there.
    const column = Math.round(offset);
    if (column !== this.#liveDayOffset) this.#liveDayOffset = column;
    // A settle's own writes come back as ticks; a tick reporting somewhere else is a hand back on
    // the week, and the hand wins — outside the desktop shell no gesture says when it starts.
    if (this.#snapping && Math.abs(scroller.scrollLeft - this.#wrote) >= 1) this.#cancelAnimation();
    // A jump or a settle drives the scroll itself and ends on its own column; letting these ticks
    // schedule another settle would have it cut the animation short from underneath.
    if (this.#jumping || this.#snapping) return;
    this.#clearSettle();
    this.#settle = setTimeout(() => this.#rest(), SETTLE_MS);
    if (data.drag) return;
    const maxOffset = STRIP_DAYS - data.visibleDays;
    const atEdge = offset < EDGE_DAYS || offset > maxOffset - EDGE_DAYS;
    if (!atEdge) this.#edgeLanded = false;
    else if (!this.#edgeLanded) this.#edgeLanded = this.#land();
  };

  // Opens on the working day, with the window's first day against the hours. Re-runs on a resize
  // (a different column width means the same offset points at a different day) and whenever the
  // window jumps programmatically (goToToday, goToDay from outside a swipe).
  #place() {
    const scroller = data.scrollerEl;
    const width = this.dayWidth;
    const offset = data.dayOffset;
    const start = data.stripStart.getTime();
    const windowDay = data.windowStart.getTime();
    if (!scroller || width === 0) return;
    // Days the window moved, signed. A jump that lands on the week already on screen moves nothing,
    // and has nothing to animate — see `#jumpTo`, which is why that shouldn't happen at all.
    const moved = this.#windowAt === null ? 0 : Math.round((windowDay - this.#windowAt) / MS_PER_DAY);
    // Read without subscribing, and cleared however this run ends: the flag belongs to the window
    // move that raised it, and re-running this effect for the clearing alone would only re-place a
    // scroll that is already where it belongs.
    const jump = untrack(() => data.animateNextJump) && moved !== 0;
    data.animateNextJump = false;

    if (jump) return this.#jump(scroller, offset * width, start, windowDay, moved);

    // Next frame: the columns have to be laid out at their new width before an offset into them
    // means anything — set it too early and the browser clamps it to a scroll range of zero.
    this.#placeFrame = requestAnimationFrame(() => {
      this.#placeFrame = null;
      if (!this.#opened) scroller.scrollTop = OPENING_HOUR * timeScale.hourPx;
      this.#opened = true;
      if (!this.#jumping && !this.#followingScroll) {
        // Only when the scroll isn't already on the column: a settle that landed dead-on would
        // otherwise take a second, redundant write a frame later.
        if (Math.abs(scroller.scrollLeft - offset * width) >= 1) scroller.scrollLeft = offset * width;
        this.#liveDayOffset = offset;
      }
      this.#followingScroll = false;
      this.#stripAt = start;
      this.#windowAt = windowDay;
    });
    return () => {
      if (this.#placeFrame !== null) cancelAnimationFrame(this.#placeFrame);
      this.#placeFrame = null;
    };
  }

  /**
   * Everything here is synchronous, and that is the point. The strip has just moved a whole
   * number of weeks under the scroll, and `#walkBack` is about to walk `scrollLeft` back by
   * exactly that much to keep the columns still — which is right for a swipe and wrong for a
   * jump, whose whole business is landing on a different week. Claiming `#stripAt` now, in this
   * same flush, is what tells it this shift has already been accounted for. Deferring any of it
   * to a frame from now is what put the week one column-run out.
   */
  #jump(scroller: HTMLElement, left: number, start: number, windowDay: number, moved: number) {
    this.#cancelAnimation();
    this.#clearSettle();
    this.#jumping = true;
    scroller.scrollLeft = left;
    this.#liveDayOffset = data.dayOffset;
    this.#followingScroll = false;
    this.#stripAt = start;
    this.#windowAt = windowDay;
    // The strip often recentres on the same offset, so there may be no distance here for
    // `scrollLeft` itself to ease across — see the note by `#easing`.
    if (theme.reduceMotion) {
      this.#jumping = false;
      return;
    }
    this.#easeDirection = moved < 0 ? -1 : 1;
    this.#easeDistance = Math.min(Math.abs(moved), data.visibleDays) * this.dayWidth;
    this.#easing = true;
    this.#slideFrame = requestAnimationFrame(() => {
      this.#slideFrame = null;
      this.#easing = false;
    });
    // The jump owns the grid until the slide is over, not just for the frame that starts it: the
    // scroll it wrote is still being reported, and a settle taking one of those late ticks for a
    // gesture would move the window off the week that was asked for.
    this.#held = setTimeout(() => {
      this.#held = null;
      this.#jumping = false;
    }, JUMP_ANIMATE_MS);
    return () => {
      if (this.#slideFrame !== null) cancelAnimationFrame(this.#slideFrame);
      if (this.#held !== null) clearTimeout(this.#held);
      this.#slideFrame = this.#held = null;
      this.#easing = false;
      this.#jumping = false;
    };
  }

  /**
   * The strip is rebuilt a week over whenever the window crosses into the next one. Nothing should
   * move on screen when that happens, so the scroll is walked back by exactly the days it shifted.
   */
  #walkBack() {
    const start = data.stripStart.getTime();
    const scroller = data.scrollerEl;
    // A jump has already placed the scroll for this shift and moved `#stripAt` on to it, so there's
    // nothing here to walk back — see `#jump`.
    if (!scroller || this.#stripAt === null || start === this.#stripAt) return;
    scroller.scrollLeft -= Math.round((start - this.#stripAt) / MS_PER_DAY) * this.dayWidth;
    if (this.dayWidth > 0) this.#liveDayOffset = Math.round(scroller.scrollLeft / this.dayWidth);
    this.#stripAt = start;
  }

  /** Eases the scroller to `target` rather than snapping straight there. */
  #animateScrollLeft(scroller: HTMLElement, target: number, duration: number, done: () => void) {
    this.#cancelAnimation();
    const from = scroller.scrollLeft;
    const delta = target - from;
    if (delta === 0) return done();
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - t) ** 3;
      scroller.scrollLeft = this.#wrote = from + delta * eased;
      this.#jumpFrame = t < 1 ? requestAnimationFrame(tick) : null;
      if (t >= 1) done();
    };
    this.#jumpFrame = requestAnimationFrame(tick);
  }

  /** Drops whatever the grid was easing towards. A new gesture outranks it: the hand is on the
   *  week, and writing a position mid-fling is what kills the fling. */
  #cancelAnimation() {
    if (this.#jumpFrame === null) return;
    cancelAnimationFrame(this.#jumpFrame);
    this.#jumpFrame = null;
    this.#snapping = false;
    this.#jumping = false;
  }

  #clearSettle() {
    if (this.#settle !== null) clearTimeout(this.#settle);
    this.#settle = null;
  }

  /** The scroll has stopped moving. On the desktop shell that's only true if the gesture behind it
   *  is over too — a fling has quiet frames in it, and easing onto a column during one would eat
   *  the momentum still queued behind it. The gesture's own end takes over in that case. */
  #rest() {
    this.#settle = null;
    // Whatever was driving the scroll over the walk back has finished with it.
    this.#edgeLanded = false;
    if (isDesktop && wheelGestureActive()) return;
    this.#settleOnColumn();
  }

  /**
   * Eases the last few pixels onto the nearest column, then moves the window to it. This is the
   * only thing that lands the week on a column: CSS snapping used to do it in a browser, and a
   * snap container is what turned a fling into a browser-driven animation to a fixed offset —
   * one the strip's recentre couldn't move, see `#edgeLanded`.
   */
  #settleOnColumn() {
    const scroller = data.scrollerEl;
    const width = this.dayWidth;
    // A jump is already driving the scroll to a column of its own. Landing here would read the
    // position it is on its way from and move the window back to it, undoing the jump.
    if (this.#jumping) return;
    if (!scroller || width === 0 || data.drag) return void this.#land();
    const target = Math.round(scroller.scrollLeft / width) * width;
    if (Math.abs(scroller.scrollLeft - target) >= 1) {
      this.#snapping = true;
      this.#animateScrollLeft(scroller, target, SNAP_ANIMATE_MS, () => {
        this.#snapping = false;
        this.#land();
      });
      return;
    }
    this.#land();
  }

  /** The column the scroll came to rest on becomes the first day on screen. Recentring keeps the
   *  scroll position visually put (see `#walkBack`), so calling this early near an edge doesn't
   *  jump anything — it just makes more columns appear to scroll into. Answers whether the window
   *  moved at all. */
  #land() {
    const scroller = data.scrollerEl;
    const width = this.dayWidth;
    if (!scroller || width === 0 || data.drag || this.#jumping) return false;
    const shift = Math.round(scroller.scrollLeft / width) - data.dayOffset;
    if (shift === 0) return false;
    // The window is following the scroll, not leading it: `#place` must leave the position alone,
    // or a mid-fling recentre would write the scroll back and stop the week dead.
    this.#followingScroll = true;
    data.goToDay(shift);
    return true;
  }
}
