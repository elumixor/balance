import { icsImport } from "$lib/calendar/ics-import.svelte";
import { desktopDock } from "$lib/desktop/dock";
import { desktopReminders } from "$lib/desktop/reminders.svelte";
import { desktopTray } from "$lib/desktop/tray.svelte";
import { desktopUpdates } from "$lib/desktop/updates.svelte";
import { integrations } from "$lib/integrations/integrations.svelte";
import { mobileReminders } from "$lib/mobile/reminders.svelte";
import { sessionReminders } from "$lib/mobile/session-reminders.svelte";
import { sessionNudge } from "$lib/planning/session-nudge.svelte";
import { startWatchHandoff } from "$lib/watch/handoff";

/** Something that runs for as long as there is a session, whether or not anybody is looking. */
interface ShellService {
  start(): void;
  stop(): void;
}

/**
 * Everything the app runs for the whole of a signed-in session: the Mac's menu bar and Dock,
 * the reminders on every platform, the sitting nudge, the share-sheet import, the integrations'
 * syncs, and the watch handoff. Each one is a singleton that knows how to start and stop itself;
 * this is only the list, so the layout doesn't have to name each twice. The watch handoff is the
 * odd one out — what it hands over is the session itself, so starting it returns its own stop.
 */
const SERVICES: readonly ShellService[] = [
  desktopTray,
  desktopDock,
  desktopUpdates,
  desktopReminders,
  mobileReminders,
  sessionReminders,
  sessionNudge,
  icsImport,
  integrations,
];

/** Starts every service, and returns the one call that stops them all. */
export function startShellServices() {
  for (const service of SERVICES) service.start();
  const stopWatchHandoff = startWatchHandoff();
  return () => {
    for (const service of SERVICES) service.stop();
    stopWatchHandoff();
  };
}
