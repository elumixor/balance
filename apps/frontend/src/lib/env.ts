import { Capacitor } from "@capacitor/core";

/**
 * Where the app looks for the API, and what it does when that answer is wrong.
 *
 * Empty on a release web build: the app is served by the same Nitro deployment that owns
 * `/mobile/*`, so a relative base keeps requests same-origin. Dev servers and native builds get an
 * absolute URL from `vite.config.ts`.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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
export const DEV_AUTH_EMAIL = import.meta.env.VITE_DEV_AUTH_EMAIL || "dev@localhost";
