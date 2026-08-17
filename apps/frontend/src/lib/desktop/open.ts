import { isDesktop } from "./platform";

/**
 * A link that belongs to somewhere else: a meeting, a route, a document in an invitation.
 *
 * The desktop shell hands it to the browser rather than navigating the window the calendar is in
 * — a webview that follows a Zoom link is a webview with no way back — and everywhere else a new
 * tab does the same thing. The plugin is imported when it's needed so the web and iOS bundles
 * don't carry it.
 */
export async function openExternal(url: string) {
  if (!url) return;
  if (isDesktop) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}
