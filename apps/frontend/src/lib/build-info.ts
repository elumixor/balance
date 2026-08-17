import { Capacitor } from "@capacitor/core";
import { isDesktop } from "./desktop/platform";

/**
 * Which build of the app is on screen.
 *
 * The same bundle ships three ways and two of those carry their own copy of it, so what is running
 * on a phone or in the macOS window can be several commits behind the checkout — with nothing on
 * screen to say so. The settings dialog prints this, which turns "is this the new one?" into a
 * question the app answers itself.
 */
export const buildInfo = {
  version: import.meta.env.VITE_APP_VERSION ?? "dev",
  commit: import.meta.env.VITE_BUILD_COMMIT ?? "unknown",
  builtAt: import.meta.env.VITE_BUILD_TIME ?? "",
  get platform() {
    if (isDesktop) return "macOS";
    if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === "ios" ? "iOS" : "Android";
    return "Web";
  },
  /** A single line: `0.1.0 · a9fb8cf · macOS · 17 Aug 14:03`. */
  get label() {
    const built = this.builtAt
      ? new Date(this.builtAt).toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    return [this.version, this.commit, this.platform, built].filter(Boolean).join(" · ");
  },
};
