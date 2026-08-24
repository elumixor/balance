import { HOUR_PX, MAX_HOUR_PX } from "./week-grid";

const HOURS_PER_DAY = 24;
const SCALE_KEY = "balance.calendar-hour-px";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * How tall an hour is drawn, and nothing else. A pinch — two fingers on the phone, the trackpad's
 * own pinch on the Mac — stretches the day open or squeezes the evenings back into view; the
 * columns keep their width, because the week is what the horizontal axis is for.
 *
 * Both ends are stops rather than suggestions. Zoomed out, the whole day has to fill the window and
 * no more: a grid shorter than what it is drawn in is empty space under the last hour, and there is
 * nothing further out to see anyway. Zoomed in, `MAX_HOUR_PX` is where an hour stops being usefully
 * bigger.
 *
 * It's a device preference rather than a per-week one: the scale you last left the grid at is the
 * scale it opens at, on that device, for whoever signs in. Kept out of `persist` for the same
 * reason — that store belongs to an account and is wiped with it.
 */
class TimeScale {
  #hourPx = $state(HOUR_PX);
  /** The scale the current pinch started from, so a gesture is one scale applied, not a hundred. */
  #base = HOUR_PX;
  /** Height the day is drawn in, which is what the smallest scale is worked out from. */
  #fitPx = $state(0);

  /** What every drawn hour, block top and grid line is measured in. */
  get hourPx() {
    return this.#hourPx;
  }

  /** The scale at which the whole day fits the window exactly — as small as the grid may go. */
  get minHourPx() {
    // Before the grid has been measured there is no window to fit, so the resting scale stands in.
    return this.#fitPx > 0 ? this.#fitPx / HOURS_PER_DAY : HOUR_PX;
  }

  get maxHourPx() {
    // A window tall enough to want more than the ceiling gets it: the floor is the harder rule.
    return Math.max(MAX_HOUR_PX, this.minHourPx);
  }

  /** Called once from the grid, where the DOM is guaranteed to exist. */
  start() {
    const stored = Number(safely(() => localStorage.getItem(SCALE_KEY)));
    if (stored > 0) this.#set(stored);
  }

  /**
   * The height the hours are drawn in — the scroller, less the header stuck to the top of it.
   * Called as the window resizes, and re-clamps the scale: a window that just grew taller than the
   * day pulls the grid open with it rather than leaving a gap under midnight.
   */
  fit(availablePx: number) {
    if (availablePx <= 0) return;
    this.#fitPx = availablePx;
    this.#set(this.#hourPx);
  }

  beginPinch() {
    this.#base = this.#hourPx;
  }

  /**
   * Scales to `factor` times where the pinch began.
   *
   * @returns how much taller the hour just got, so the caller can hold the time under the fingers
   * still. It's 1 when the pinch is already against a stop, which is also the caller's cue that
   * there is no scroll to correct.
   */
  pinchTo(factor: number) {
    const was = this.#hourPx;
    this.#set(this.#base * factor);
    return this.#hourPx / was;
  }

  endPinch() {
    this.#base = this.#hourPx;
    safely(() => localStorage.setItem(SCALE_KEY, String(this.#hourPx)));
  }

  #set(hourPx: number) {
    this.#hourPx = clamp(hourPx, this.minHourPx, this.maxHourPx);
    // A stop the pinch is being held against must move the base with it, or letting go and pinching
    // the other way would first have to undo the distance the fingers spent going nowhere.
    this.#base = clamp(this.#base, this.minHourPx, this.maxHourPx);
  }
}

/**
 * Where the grid has to scroll to for the moment under the fingers to stay under them.
 *
 * Everything is measured from the top of the hours themselves, so the sticky header — which
 * doesn't scale — is taken off the pointer's position first and added back after.
 *
 * @param pointerY the pinch's centre, in pixels down the scroller's own box.
 */
export function anchoredScrollTop(scrollTop: number, pointerY: number, headerPx: number, ratio: number) {
  const gridY = scrollTop + pointerY - headerPx;
  return Math.max(0, headerPx + gridY * ratio - pointerY);
}

/**
 * Best-effort: storage can be missing, full, disabled, or — in Safari with site data blocked —
 * throw on the mere mention of it. A scale nobody can save isn't worth an error on screen.
 */
function safely<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

export const timeScale = new TimeScale();
