import { theme } from "$lib/theme.svelte";
import { StatusBar, Style } from "@capacitor/status-bar";
import { isIOSApp } from "./platform";

/**
 * The clock and the battery follow the app's own scheme rather than the system's. Without this a
 * person who keeps the phone light and the app dark gets black glyphs on a near-black page.
 * `Style.Dark` is the dark *background* — light glyphs — in the plugin's vocabulary.
 */
class MobileStatusBar {
  start() {
    if (!isIOSApp) return;
    $effect(() => {
      const style = theme.scheme === "dark" ? Style.Dark : Style.Light;
      void StatusBar.setStyle({ style }).catch(() => undefined);
    });
  }
}

export const mobileStatusBar = new MobileStatusBar();
