import type { Pane } from "./settings/panes";

/**
 * Whether the settings panel is open, and on which page.
 *
 * Module-level rather than a prop, because two unrelated things open it — the avatar in the rail
 * and ⌘, from anywhere — and neither should have to know where the panel is rendered. The page is
 * here too, so the avatar can open straight onto the inbox when something is waiting there.
 */
class Settings {
  open = $state(false);
  pane = $state<Pane>("general");

  show(pane?: Pane) {
    if (pane) this.pane = pane;
    this.open = true;
  }

  hide() {
    this.open = false;
  }

  toggle() {
    this.open = !this.open;
  }
}

export const settings = new Settings();
