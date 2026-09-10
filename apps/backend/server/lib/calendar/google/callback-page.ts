import type { ConnectMode } from "~/lib/calendar/state";
import { isAppOrigin } from "~/lib/calendar/state";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Long enough to read "connected", short enough not to feel like a page. */
const REDIRECT_DELAY_MS = 900;

/**
 * The page the OAuth callback answers with — the one HTML the API serves.
 *
 * On web this tab is the app's own tab, so it goes back to the screen the flow started from — at
 * the origin the app is actually served from, which in dev is the Vite server rather than this one. On iOS it's a
 * Safari sheet the app opened; nothing here can dismiss it reliably, so it says so and the app
 * notices the connection on its own.
 */
export function callbackPage({
  mode,
  origin,
  back: path = "/calendar",
  title,
  body,
  failed,
}: {
  mode: ConnectMode;
  origin: string;
  /** The screen the flow belongs to — a calendar grant lands on the week, Notion's on projects. */
  back?: string;
  title: string;
  body: string;
  failed?: boolean;
}) {
  const back = `${origin}${path}`;
  const redirect =
    mode === "web" && !failed && isAppOrigin(origin)
      ? `<script>setTimeout(() => location.replace(${JSON.stringify(back)}), ${REDIRECT_DELAY_MS})</script>`
      : "";
  const hint = mode === "app" ? "You can close this window and go back to Balance." : "Taking you back to Balance…";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 2rem;
         font: 16px/1.5 -apple-system, system-ui, sans-serif; }
  main { max-width: 24rem; text-align: center }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem }
  p { margin: 0; opacity: .7 }
</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><p>${escapeHtml(failed ? "" : hint)}</p></main>${redirect}</body></html>`;
}
