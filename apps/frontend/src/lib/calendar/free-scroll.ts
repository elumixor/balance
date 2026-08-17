import { isDesktop } from "$lib/desktop/platform";

/** A wheel notch in line units is worth about a line of text; a page is the viewport. */
const LINE_PX = 16;
/**
 * How long after the last wheel event the gesture counts as over. A trackpad fling keeps emitting
 * wheel events through its whole momentum tail, so the gap between two of them stays well under
 * this even at the very end of a slow drift.
 */
const GESTURE_END_MS = 140;

type GestureListener = { start?: () => void; end?: () => void };

const listeners = new Set<GestureListener>();
let gestureTimer: ReturnType<typeof setTimeout> | null = null;
let active = false;

/**
 * Whether a wheel gesture — the drag and the momentum after it — is still going.
 *
 * Anything that writes `scrollLeft` has to ask: a write lands as an absolute position and throws
 * away everything the fling has queued behind it, so the week stops dead mid-flight. Wait for
 * `end` instead.
 */
export const wheelGestureActive = () => active;

/** Subscribes to the start and end of wheel gestures. Returns the unsubscribe. */
export function onWheelGesture(listener: GestureListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function keepAlive() {
  if (!active) {
    active = true;
    for (const listener of listeners) listener.start?.();
  }
  if (gestureTimer) clearTimeout(gestureTimer);
  gestureTimer = setTimeout(() => {
    gestureTimer = null;
    active = false;
    for (const listener of listeners) listener.end?.();
  }, GESTURE_END_MS);
}

/**
 * Lets the week scroll in both directions at once.
 *
 * WebKit locks a wheel gesture to whichever axis it started on — start moving sideways and the
 * vertical component is dropped until you let go. Chromium doesn't, which is why the same grid
 * scrolls diagonally in a browser and only ever one way in the macOS app. It isn't reachable from
 * CSS, so the gesture is applied by hand instead: both deltas, every event.
 *
 * CSS snapping has to go with it. The grid snaps to day columns, and a snap container re-snaps
 * after *every* programmatic scroll — so a run of small `scrollLeft` writes gets dragged back to
 * the column it started on and the week never moves sideways at all. Turning it off leaves the
 * grid's own settle to land the week on a column, which it was already doing, and which can ease
 * into place rather than arriving there between two frames.
 *
 * Only in the desktop shell. A browser is either Chromium, where this is already the behaviour, or
 * Safari, where replacing native scrolling would cost more than the diagonal is worth; touch
 * scrolling never emits wheel events at all.
 */
export function freeScroll(node: HTMLElement) {
  if (!isDesktop) return;

  node.style.scrollSnapType = "none";

  function onwheel(event: WheelEvent) {
    // A trackpad pinch arrives as a ctrl-held wheel, and it isn't a scroll.
    if (event.ctrlKey || (event.deltaX === 0 && event.deltaY === 0)) return;

    const scale =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? LINE_PX
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? node.clientHeight
          : 1;

    event.preventDefault();
    keepAlive();
    node.scrollLeft += event.deltaX * scale;
    node.scrollTop += event.deltaY * scale;
  }

  // Not passive: the whole point is to take the gesture over from the browser.
  node.addEventListener("wheel", onwheel, { passive: false });
  return {
    destroy() {
      node.removeEventListener("wheel", onwheel);
      node.style.removeProperty("scroll-snap-type");
    },
  };
}
