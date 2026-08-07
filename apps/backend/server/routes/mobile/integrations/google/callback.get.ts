import { eventHandler, getQuery, setResponseHeader, setResponseStatus } from "h3";
import { googleOAuthService } from "../../../../lib/calendar/google/oauth";
import { ProviderAccountService } from "../../../../lib/calendar/provider-accounts";
import { type ConnectMode, verifyOAuthState } from "../../../../lib/calendar/state";

/**
 * The one route that answers HTML instead of JSON, and the one that isn't authenticated: Google
 * sends the user's browser here, and the signed `state` is what says whose account this is.
 */
export default eventHandler(async (event) => {
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  const query = getQuery(event);
  const state = typeof query.state === "string" ? query.state : "";
  const code = typeof query.code === "string" ? query.code : "";

  let mode: ConnectMode = "web";
  try {
    if (typeof query.error === "string") throw new Error(`Google cancelled the connection (${query.error})`);
    const verified = verifyOAuthState(state);
    mode = verified.mode;
    if (!code) throw new Error("Google didn't send an authorization code");

    const { tokens, identity } = await googleOAuthService.exchangeCode(code);
    await new ProviderAccountService(verified.userId).connect("google", tokens, identity);

    return page({
      mode,
      title: "Calendar connected",
      body: `Balance is now reading ${identity.email ?? "your calendar"}.`,
    });
  } catch (e) {
    setResponseStatus(event, 400);
    return page({
      mode,
      title: "That didn't work",
      body: e instanceof Error ? e.message : "Something went wrong connecting your calendar.",
      failed: true,
    });
  }
});

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/**
 * On web this tab is the app's own tab, so it goes back to the calendar. On iOS it's a Safari
 * sheet the app opened; nothing here can dismiss it reliably, so it says so and the app notices
 * the connection on its own.
 */
function page({ mode, title, body, failed }: { mode: ConnectMode; title: string; body: string; failed?: boolean }) {
  const redirect =
    mode === "web" && !failed ? '<script>setTimeout(() => location.replace("/calendar"), 900)</script>' : "";
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
