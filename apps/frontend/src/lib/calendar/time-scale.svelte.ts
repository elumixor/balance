import { HOUR_PX, MAX_ZOOM, MIN_ZOOM } from "./week-grid";

const ZOOM_KEY = "balance.calendar-zoom";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * How tall an hour is drawn, and nothing else. A pinch — two fingers on the phone, the trackpad's
 * own pinch on the Mac — stretches the day open or squeezes a fortnight of evenings back into view;
 * the columns keep their width, because the week is what the horizontal axis is for.
 *
 * It's a device preference rather than a per-week one: the scale you last left the grid at is the
 * scale it opens at, on that device, for whoever signs in. Kept out of `persist` for the same
 * reason — that store belongs to an account and is wiped with it.
 */
class TimeScale {
  #zoom = $state(1);
  /** The zoom the current pinch started from, so a gesture is one scale applied, not a hundred. */
  #base = 1;

  get zoom() {
    return this.#zoom;
  }

  /** What every drawn hour, block top and grid line is measured in. */
  get hourPx() {
    return HOUR_PX * this.#zoom;
  }

  /** Called once from the grid, where the DOM is guaranteed to exist. */
  start() {
    const stored = Number(safely(() => localStorage.getItem(ZOOM_KEY)));
    if (stored > 0) this.#zoom = clamp(stored, MIN_ZOOM, MAX_ZOOM);
  }

  beginPinch() {
    this.#base = this.#zoom;
  }

  /**
   * Scales to `factor` times where the pinch began.
   *
   * @returns how much taller the hour just got, so the caller can hold the time under the fingers
   * still. It's 1 when the pinch is already against a limit, which is also the caller's cue that
   * there is no scroll to correct.
   */
  pinchTo(factor: number) {
    const was = this.hourPx;
    this.#zoom = clamp(this.#base * factor, MIN_ZOOM, MAX_ZOOM);
    return this.hourPx / was;
  }

  endPinch() {
    this.#base = this.#zoom;
    safely(() => localStorage.setItem(ZOOM_KEY, String(this.#zoom)));
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
