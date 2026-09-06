import { z } from "zod";
import { googleOAuthService } from "~/lib/calendar/google/oauth";
import { isAppOrigin, signOAuthState } from "~/lib/calendar/state";
import { ApiError } from "~/lib/http/api-error";
import { authed } from "~/lib/http/authed";

/**
 * Hands back the consent URL rather than redirecting to it. The browser that runs the consent
 * flow — Safari on iOS, the tab itself on web — can't carry the app's Clerk bearer, so the app
 * asks for the URL over its authenticated channel and opens it itself.
 */
export default authed({ body: { mode: z.enum(["app", "web"]), origin: z.string() } }, async ({ body, user }) => {
  if (!isAppOrigin(body.origin)) throw new ApiError("That's not somewhere we can send you back to");
  const state = signOAuthState({ userId: user.id, mode: body.mode, origin: body.origin });
  return { url: googleOAuthService.authUrl(state) };
});
