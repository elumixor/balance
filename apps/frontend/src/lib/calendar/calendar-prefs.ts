import { updateCalendarPrefs } from "$lib/core/queries";
import { store } from "$lib/core/store.svelte";
import { diagnostics } from "$lib/platform/diagnostics.svelte";

/** What the rail and the settings pane can change about the calendars: which show, which is written to. */
export type CalendarPrefsPatch = { visibleCalendarIds?: string[]; writeCalendarId?: string };

/**
 * Applies the change to the screen immediately, then tells the server — reverting only on failure.
 * The one write path for calendar preferences, so the rail and settings can't disagree about what
 * a refused change looks like.
 */
export function saveCalendarPrefs(patch: CalendarPrefsPatch) {
  const prefs = store.calendars;
  const previous = prefs.value;
  if (!previous) return;
  prefs.set({ ...previous, ...patch });
  void updateCalendarPrefs(patch).catch((e) => {
    prefs.set(previous);
    diagnostics.report("Calendars", e, { title: "Couldn’t save that" });
  });
}
