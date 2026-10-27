import type { Snippet } from "svelte";

/**
 * What a screen hands the shell to draw for it. A screen owns the controls that only make sense
 * on it — which calendars get drawn — and hands them here rather than
 * spending its own width and its own line on chrome the shell is already drawing.
 */
class ShellSlots {
  /** The rail's second half, under the nav list. */
  panel = $state<Snippet | null>(null);
  /** Where you are, on the strip's own line between the icons and the account. */
  where = $state<Snippet | null>(null);
}

export const shellSlots = new ShellSlots();
