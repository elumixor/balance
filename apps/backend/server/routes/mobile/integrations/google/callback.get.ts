import { eventHandler, getQuery, setResponseHeader, setResponseStatus } from "h3";
import { callbackPage } from "~/lib/calendar/google/callback-page";
import { googleOAuthService } from "~/lib/calendar/google/oauth";
import { ProviderAccountService } from "~/lib/calendar/provider-accounts";
import { GOOGLE } from "~/lib/calendar/registry";
import { type ConnectMode, verifyOAuthState } from "~/lib/calendar/state";
import { ApiError } from "~/lib/http/api-error";
import { captureError } from "~/lib/telemetry";

/**
 * The one route that answers HTML instead of JSON, and the one that isn't authenticated: Google
 * sends the user's browser here, and the signed `state` is what says whose account this is. It
 * answers a page whatever happens, because a browser tab is the only thing that will read it.
 */
export default eventHandler(async (event) => {
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  const query = getQuery(event);
  const state = typeof query.state === "string" ? query.state : "";
  const code = typeof query.code === "string" ? query.code : "";

  let mode: ConnectMode = "web";
  let origin = "";
  try {
    if (typeof query.error === "string") throw new ApiError(`Google cancelled the connection (${query.error})`);
    const verified = verifyOAuthState(state);
    mode = verified.mode;
    origin = verified.origin;
    if (!code) throw new ApiError("Google didn't send an authorization code");

    const { tokens, identity } = await googleOAuthService.exchangeCode(code);
    await new ProviderAccountService(verified.userId).connect(GOOGLE, tokens, identity);

    return callbackPage({
      mode,
      origin,
      title: "Calendar connected",
      body: `Balance is now reading ${identity.email ?? "your calendar"}.`,
    });
  } catch (e) {
    // An `ApiError` is a sentence for the person; anything else is a crash worth knowing about,
    // reported here because the page is the only place it can end up.
    if (!(e instanceof ApiError)) await captureError(e, { path: event.path, method: event.method });
    setResponseStatus(event, e instanceof ApiError ? e.status : 500);
    return callbackPage({
      mode,
      origin,
      title: "That didn't work",
      body: e instanceof ApiError ? e.message : "Something went wrong connecting your calendar.",
      failed: true,
    });
  }
});
