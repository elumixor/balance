import type { Snippet } from "svelte";

/**
 * The rail's second half. A screen owns the controls that only make sense on it — which
 * calendars get drawn, what can be dragged onto them — and hands them here instead of
 * spending its own width on a column of chrome.
 */
class SidePanel {
  section = $state<Snippet | null>(null);
}

export const sidePanel = new SidePanel();
