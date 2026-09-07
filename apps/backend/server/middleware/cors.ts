import { defineEventHandler, handleCors } from "h3";
import { isProduction } from "~/lib/env";

/**
 * Who may call this API from a browser with a bearer token.
 *
 * The web app is served by this same deployment and needs no CORS at all; the list is for the
 * native shells, whose webviews have origins of their own: iOS serves its bundle from
 * `https://localhost` (`capacitor.config.ts`), Capacitor's default scheme is kept for the day
 * that changes, and the macOS app serves its bundle from its own localhost server on port 8123
 * (`src-tauri/src/lib.rs`), with `tauri://localhost` kept for a window opened before that server
 * is up. Anything else with a token is not one of ours.
 */
const ALLOWED_ORIGINS = [
  "https://balance-app-mauve.vercel.app",
  "https://localhost",
  "capacitor://localhost",
  "tauri://localhost",
  "http://localhost:8123",
];

/** A dev server on this machine or on the LAN, for a phone pointed at it — never in production. */
const DEV_ORIGIN =
  /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

function isAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || (!isProduction && DEV_ORIGIN.test(origin));
}

export default defineEventHandler((event) => {
  handleCors(event, {
    origin: isAllowed,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  });
});
