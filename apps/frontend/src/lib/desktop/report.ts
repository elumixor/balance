import { isDesktop } from "./platform";

/**
 * Something went wrong on a screen nobody is looking at.
 *
 * The menu bar, the Dock icon and the reminders all run without a window open, and a `console`
 * they write to in a packaged build is a console with no devtools attached — which is how a menu
 * bar that had quietly stopped updating went unnoticed for weeks. This puts the same line in the
 * shell's log file, where `bun run desktop` and Console.app can both find it.
 */
export function report(what: string, cause: unknown) {
  const message = `${what}: ${cause instanceof Error ? cause.message : String(cause)}`;
  console.error(message);
  if (!isDesktop) return;
  void import("@tauri-apps/plugin-log")
    .then(({ error }) => error(message))
    .catch(() => {
      // If even the log won't take it, the console line above is what there is.
    });
}
