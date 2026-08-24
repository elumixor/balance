/**
 * A pinch, from either of the two things that can make one.
 *
 * A trackpad pinch doesn't arrive as a gesture at all: the OS reports it as a wheel event with
 * ctrl held, which is also what a browser zooms the whole page on — so it has to be taken over,
 * not observed. Each notch is its own little gesture, opened and closed on the spot.
 *
 * Two fingers on a phone are the real thing, and are measured the honest way: the distance between
 * them now against the distance they started at, so the scale is absolute across the gesture and a
 * pinch that goes out and comes back lands exactly where it began.
 */
export interface PinchTarget {
  /** The gesture is starting — capture whatever it will be measured against. */
  start(): void;
  /** @param scale how far apart the fingers are now, relative to the start of this gesture. */
  move(scale: number, centreY: number): void;
  end(): void;
}

/** How far a trackpad has to be pinched for the hour to double. Matched to macOS's own feel. */
const WHEEL_ZOOM_PX = 120;

export function pinch(node: HTMLElement, target: PinchTarget) {
  let startDistance = 0;

  function onwheel(event: WheelEvent) {
    // The trackpad's pinch, and the only thing ctrl-wheel means here — see `freeScroll`, which
    // deliberately lets this one through.
    if (!event.ctrlKey) return;
    // Or the browser zooms the app itself, which on a phone-sized webview is unrecoverable.
    event.preventDefault();
    target.start();
    target.move(Math.exp(-event.deltaY / WHEEL_ZOOM_PX), event.clientY);
    target.end();
  }

  function ontouchstart(event: TouchEvent) {
    if (event.touches.length !== 2) return;
    startDistance = distance(event.touches);
    target.start();
  }

  function ontouchmove(event: TouchEvent) {
    if (startDistance === 0 || event.touches.length !== 2) return;
    // Not passive: the same two fingers would otherwise scroll the week away underneath the pinch.
    event.preventDefault();
    target.move(distance(event.touches) / startDistance, centreY(event.touches));
  }

  function ontouchend(event: TouchEvent) {
    if (startDistance === 0 || event.touches.length >= 2) return;
    startDistance = 0;
    target.end();
  }

  node.addEventListener("wheel", onwheel, { passive: false });
  node.addEventListener("touchstart", ontouchstart, { passive: true });
  node.addEventListener("touchmove", ontouchmove, { passive: false });
  node.addEventListener("touchend", ontouchend);
  node.addEventListener("touchcancel", ontouchend);

  return {
    destroy() {
      node.removeEventListener("wheel", onwheel);
      node.removeEventListener("touchstart", ontouchstart);
      node.removeEventListener("touchmove", ontouchmove);
      node.removeEventListener("touchend", ontouchend);
      node.removeEventListener("touchcancel", ontouchend);
    },
  };
}

function distance(touches: TouchList) {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

function centreY(touches: TouchList) {
  return (touches[0].clientY + touches[1].clientY) / 2;
}
