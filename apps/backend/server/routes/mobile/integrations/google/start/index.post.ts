import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { ApiError, handleApiError } from "../../../../../lib/api-error";
import { googleOAuthService } from "../../../../../lib/calendar/google/oauth";
import { isAppOrigin, signOAuthState } from "../../../../../lib/calendar/state";
import { getDbUserForRequest } from "../../../../../lib/current-user";

/**
 * Hands back the consent URL rather than redirecting to it. The browser that runs the consent
 * flow — Safari on iOS, the tab itself on web — can't carry the app's Clerk bearer, so the app
 * asks for the URL over its authenticated channel and opens it itself.
 */
export default handler({ body: { mode: z.enum(["app", "web"]), origin: z.string() } }, async ({ body, event }) => {
  const user = await getDbUserForRequest(event);
  try {
    if (!isAppOrigin(body.origin)) throw new ApiError("That's not somewhere we can send you back to");
    const state = signOAuthState({ userId: user.id, mode: body.mode, origin: body.origin });
    return { url: googleOAuthService.authUrl(state) };
  } catch (e) {
    return handleApiError(event, e);
  }
});
