/**
 * Where a list that hangs off a field goes, and how it gets out of the field's card.
 *
 * Every typed-into field with a list under it — a zone, a time, an address — wants the same two
 * things: a place below the field when the list fits there and above it otherwise, kept off the
 * notch and the home indicator; and a home at the top of the document, because inside the card
 * it would be clipped by the card's own scroll and placed against the card instead of the window.
 */
import { safeArea } from "$lib/platform/safe-area";

export const MENU_MAX_HEIGHT = 280;
const GAP = 6;
const MARGIN = 12;

export interface FloatPosition {
  readonly left: number;
  readonly top: number;
}

/** Below the anchor when the list fits there, above it otherwise. */
export function placeMenu(anchor: HTMLElement, width: number, maxHeight = MENU_MAX_HEIGHT): FloatPosition {
  const rect = anchor.getBoundingClientRect();
  const safe = safeArea();
  const below = rect.bottom + GAP;
  // What is actually visible, not what the page is: a keyboard leaves `innerHeight` alone, and a
  // list placed against it goes under the keys.
  const height = window.visualViewport?.height ?? window.innerHeight;
  const fitsBelow = below + maxHeight <= height - safe.bottom - MARGIN;
  return {
    left: Math.min(Math.max(MARGIN, rect.left), window.innerWidth - width - MARGIN),
    top: fitsBelow ? below : Math.max(safe.top + MARGIN, rect.top - GAP - maxHeight),
  };
}

/** Keeps a list placed while the page moves under it; returns the teardown for an `$effect`. */
export function followAnchor(reposition: () => void): () => void {
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
  return () => {
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
  };
}

/** An attachment that moves the node to the body for as long as it lives. */
export function layer(node: HTMLElement) {
  document.body.appendChild(node);
  return () => node.remove();
}
