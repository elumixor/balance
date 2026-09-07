import { Capacitor } from "@capacitor/core";
import { isDesktop, isNativeShell } from "$lib/desktop/platform";
import { BUILD_COMMIT, BUILD_TIME, BUILD_VERSION } from "./env";

/**
 * Which build of the app is on screen.
 *
 * The same bundle ships three ways and two of those carry their own copy of it, so what is running
 * on a phone or in the macOS window can be several commits behind the checkout — with nothing on
 * screen to say so. The About section of settings prints this, which turns "is this the new one?"
 * into a question the app answers itself.
 */
export const buildInfo = {
  version: BUILD_VERSION,
  commit: BUILD_COMMIT,
  builtAt: BUILD_TIME,
  get platform() {
    if (isDesktop) return "macOS";
    if (!isNativeShell) return "Web";
    return Capacitor.getPlatform() === "ios" ? "iOS" : "Android";
  },
  /** The commit and the moment it was built, for the hover behind the version number. */
  get provenance() {
    const built = this.builtAt
      ? new Date(this.builtAt).toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    return [this.commit, built].filter(Boolean).join(" · ");
  },
};
