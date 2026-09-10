import { z } from "zod";
import { isAppOrigin, signOAuthState } from "~/lib/calendar/state";
import { ApiError } from "~/lib/http/api-error";
import { authed } from "~/lib/http/authed";
import { NotionService } from "~/lib/notion/service";

/**
 * Hands back the consent URL rather than redirecting to it, the way the calendar's does: the
 * browser that runs the flow can't carry the app's Clerk bearer, so the app asks for the URL over
 * its authenticated channel and opens it itself.
 */
export default authed({ body: { mode: z.enum(["app", "web"]), origin: z.string() } }, async ({ body, user }) => {
  if (!isAppOrigin(body.origin)) throw new ApiError("That's not somewhere we can send you back to");
  const state = signOAuthState({ userId: user.id, mode: body.mode, origin: body.origin });
  return { url: new NotionService(user.id).authUrl(state) };
});
