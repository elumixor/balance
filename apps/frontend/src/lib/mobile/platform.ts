import { Capacitor } from "@capacitor/core";

/**
 * Whether this bundle is running inside the iOS app rather than a browser or the macOS shell.
 *
 * The same SPA ships three ways, and the notifications the phone hands to iOS have no meaning in
 * the other two — the Mac shows its own card, and a browser tab has nowhere to put either.
 */
export const isIOSApp = Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();

/** The iPhone app's page — Apple's, so an iPhone updates from there and every other platform sends people to it. */
export const APP_STORE_URL = "https://apps.apple.com/app/id6796754832";
