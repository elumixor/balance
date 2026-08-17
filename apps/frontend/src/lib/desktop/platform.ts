import { Capacitor } from "@capacitor/core";
import { isTauri } from "@tauri-apps/api/core";

/**
 * Whether this bundle is running inside the macOS shell rather than a browser or the iOS webview.
 *
 * The same SPA ships three ways, so anything that talks to `src-tauri` has to ask first — the
 * `invoke` bridge simply isn't there on the other two, and calling it throws.
 */
export const isDesktop = isTauri();

/** Whether this is one of the two app shells rather than a browser tab — anything a browser claims
 *  for itself, keystrokes included, has to be arranged differently in the third. */
export const isNativeShell = isDesktop || Capacitor.isNativePlatform();
