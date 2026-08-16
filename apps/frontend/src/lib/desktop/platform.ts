import { isTauri } from "@tauri-apps/api/core";

/**
 * Whether this bundle is running inside the macOS shell rather than a browser or the iOS webview.
 *
 * The same SPA ships three ways, so anything that talks to `src-tauri` has to ask first — the
 * `invoke` bridge simply isn't there on the other two, and calling it throws.
 */
export const isDesktop = isTauri();
