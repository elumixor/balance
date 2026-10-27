import { Capacitor } from "@capacitor/core";

/**
 * Where the app looks for the API, and what it does when that answer is wrong.
 *
 * Empty on a release web build: the app is served by the same Nitro deployment that owns
 * `/mobile/*`, so a relative base keeps requests same-origin. Dev servers and native builds get an
 * absolute URL from `vite.config.ts`.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * A native shell has no origin worth talking to: iOS serves the bundle from `https://localhost`
 * and macOS from `tauri://`, so a relative base points every request at the bundle itself. The
 * webview answers those with `index.html` and a 200, which is worse than a failure — the app
 * would parse a page as a week and show nothing wrong. Named here so start-up can say so.
 */
export const apiBaseUrlProblem =
  Capacitor.isNativePlatform() && !/^https?:\/\//.test(API_BASE_URL)
    ? `This build has no API address (VITE_API_BASE_URL is ${API_BASE_URL ? `"${API_BASE_URL}"` : "empty"}), ` +
      "so it has nothing to load from. Rebuild it with the address of the backend."
    : null;

/**
 * Skip the sign-in entirely, for a simulator pointed at a local backend.
 *
 * Only ever true in a development build — `vite.config.ts` defines it as `"0"` for anything else,
 * so a release can't carry it however the environment is set. The backend is the real fence: it
 * ignores `DEV_AUTH_EMAIL` in production and on Vercel, so the worst this half can do is save
 * the clicks.
 */
export const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === "1";

/** Who the bypass says you are — the same account `DEV_AUTH_EMAIL` names on the backend. */
export const DEV_AUTH_EMAIL = import.meta.env.VITE_DEV_AUTH_EMAIL;

/** Vite's own flag: a development server, never a preview or a release build. */
export const IS_DEV = import.meta.env.DEV;

/** The build stamped in by `vite.config.ts`; "dev" and "unknown" are what a dev server says. */
export const BUILD_VERSION: string = import.meta.env.VITE_APP_VERSION ?? "dev";
export const BUILD_COMMIT: string = import.meta.env.VITE_BUILD_COMMIT ?? "unknown";
export const BUILD_TIME: string = import.meta.env.VITE_BUILD_TIME ?? "";

// Public identifiers, not secrets: every one of these ships in the bundle by design.
export const CLERK_PUBLISHABLE_KEY: string = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
export const SENTRY_DSN: string = import.meta.env.VITE_SENTRY_DSN;
export const POSTHOG_KEY: string = import.meta.env.VITE_POSTHOG_KEY;
/** PostHog's EU and US clouds are different hosts, and a self-hosted one is a third. */
export const POSTHOG_HOST: string = import.meta.env.VITE_POSTHOG_HOST;

/** The OAuth client the iOS picker signs in with — the same one the backend verifies. */
export const GOOGLE_IOS_CLIENT_ID = "836194369955-5vudcjgcu637ma5bje6idu96emjm0f1a.apps.googleusercontent.com";
/** Sign in with Apple names the app by its bundle id. */
export const APPLE_CLIENT_ID = "com.elumixor.balance";

/**
 * Where the hosted web app lives — the one origin with https that a browser can be sent back
 * to, which the macOS shell needs for its sign-in hand-off.
 */
export const WEB_APP_ORIGIN = IS_DEV ? "http://localhost:8081" : "https://balance-app-mauve.vercel.app";

/**
 * Where projects and tasks live — Kip. A block names its task by URN and the card links there;
 * nothing of Kip is loaded into this app.
 */
export const KIP_ORIGIN = "https://kip.dsk.atmagaming.com";
