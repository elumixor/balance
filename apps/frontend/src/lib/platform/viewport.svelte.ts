import { browser } from "$app/environment";

/**
 * The two widths the app changes shape at. `MD` is where the bottom tabs become a side rail;
 * `XL` is where a ring screen splits into ring-beside-list.
 */
const SM = 640;
const MD = 768;
const XL = 1280;

class Viewport {
  width = $state(browser ? window.innerWidth : MD);
  /**
   * Whether the app is touched rather than pointed at. A finger has no caret and no Tab key, so a
   * field that is typed into and picked from on a Mac is the platform's own wheel on a phone —
   * which is also the only thing that knows to lift itself over the keyboard.
   */
  readonly touch = browser && window.matchMedia("(pointer: coarse)").matches;

  /** Where a sheet becomes a card: the phone is everything under this. */
  get sm() {
    return this.width >= SM;
  }

  get md() {
    return this.width >= MD;
  }

  get xl() {
    return this.width >= XL;
  }

  /** Called once from the root layout, where the DOM is guaranteed to exist. */
  start() {
    if (!browser) return;
    const onResize = () => (this.width = window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }
}

export const viewport = new Viewport();
