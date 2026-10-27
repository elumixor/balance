import { eventHandler, getQuery, setResponseHeader, setResponseStatus } from "h3";
import { callbackPage } from "~/lib/calendar/google/callback-page";
import { type ConnectMode, verifyOAuthState } from "~/lib/calendar/state";
import { ApiError } from "~/lib/http/api-error";
import { captureError } from "~/lib/telemetry";
import { ZoomService } from "~/lib/zoom/service";

/**
 * Where Zoom sends the browser back to. Unauthenticated, like the calendar's: the
 * signed `state` is the only thing that says whose account this grant belongs to, and the answer
 * is a page rather than JSON because a browser tab is the only thing that will read it.
 */
export default eventHandler(async (event) => {
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  const query = getQuery(event);
  const state = typeof query.state === "string" ? query.state : "";
  const code = typeof query.code === "string" ? query.code : "";

  let mode: ConnectMode = "web";
  let origin = "";
  try {
    if (typeof query.error === "string") throw new ApiError(`Zoom cancelled the connection (${query.error})`);
    const verified = verifyOAuthState(state);
    mode = verified.mode;
    origin = verified.origin;
    if (!code) throw new ApiError("Zoom didn't send an authorization code");

    await new ZoomService(verified.userId).complete(code);
    return callbackPage({
      mode,
      origin,
      back: "/calendar",
      title: "Zoom connected",
      body: "Balance can now make Zoom rooms for your meetings.",
    });
  } catch (e) {
    if (!(e instanceof ApiError)) await captureError(e, { path: event.path, method: event.method });
    setResponseStatus(event, e instanceof ApiError ? e.status : 500);
    return callbackPage({
      mode,
      origin,
      back: "/calendar",
      title: "That didn't work",
      body: e instanceof ApiError ? e.message : "Something went wrong connecting Zoom.",
      failed: true,
    });
  }
});
