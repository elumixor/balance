import { browser } from "$app/environment";

/**
 * How much of the window something the platform put up — the keyboard, a date wheel, an
 * autocomplete bar — is covering, in pixels from the bottom.
 *
 * A sheet is `position: fixed`, so the scroll iOS does to bring a focused field above the keyboard
 * moves nothing here: the field stays under it and the card looks broken. `visualViewport` is what
 * actually knows, and the sheet rides on top of the number it reports.
 */
class Keyboard {
  inset = $state(0);

  /** Called once from the root layout, where the DOM is guaranteed to exist. */
  start() {
    const view = browser ? window.visualViewport : null;
    if (!view) return;
    const measure = () => {
      // What the layout viewport has that the visual one doesn't, minus however far it is scrolled
      // — the part of the window that is covered rather than merely out of view.
      this.inset = Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop));
    };
    measure();
    view.addEventListener("resize", measure);
    view.addEventListener("scroll", measure);
    return () => {
      view.removeEventListener("resize", measure);
      view.removeEventListener("scroll", measure);
    };
  }
}

export const keyboard = new Keyboard();
