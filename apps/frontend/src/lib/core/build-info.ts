import { Capacitor } from "@capacitor/core";
import { isDesktop, isNativeShell } from "$lib/desktop/platform";

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
    if (!isNativeShell) return "Web";
    return Capacitor.getPlatform() === "ios" ? "iOS" : "Android";
  },
  /** The line at the bottom of settings, as its parts — the dots between them are the dialog's. */
  get parts() {
    const built = this.builtAt
      ? new Date(this.builtAt).toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    return [this.version, this.commit, this.platform, built].filter(Boolean);
  },
};
