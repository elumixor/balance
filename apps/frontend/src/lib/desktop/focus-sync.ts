import { getCurrentWindow } from "@tauri-apps/api/window";
import { calendarData } from "$lib/calendar/calendar-data.svelte";
import { store } from "$lib/core/store.svelte";
import { isDesktop } from "./platform";

/**
 * A phone screen refetches on remount; the desktop window never remounts, it just sits there for
 * days. Regaining focus is the closest thing it has to "coming back to a screen" — worth checking
 * for whatever changed while nobody was looking, a calendar connected from the web included.
 */
export function watchDesktopFocus() {
  if (!isDesktop) return () => {};

  const pending = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (!focused) return;
    void store.integrations.refresh();
    void store.calendars.refresh();
    void calendarData.refreshWeeks();
  });

  return () => void pending.then((off) => off());
}
