import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../../lib/api-error";
import { clerkClient, getDbUserForRequest } from "../../../../lib/current-user";

/**
 * Hands a browser session over to the macOS app.
 *
 * Google and Apple both refuse OAuth inside an embedded webview, and the desktop app's origin
 * (`tauri://localhost`) isn't a redirect target Clerk will accept anyway — so the app opens the
 * consent flow in the real browser instead. This is the last step of that: the browser, now signed
 * in, trades its session for a short-lived sign-in ticket, and hands it back over a `balance-desktop://`
 * link. The app redeems it exactly the way iOS redeems its native one.
 *
 * A minute is plenty for a deep link to travel between two apps on the same machine, and short
 * enough that a ticket left in a URL bar is worthless by the time anyone reads it.
 */
export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    const signInToken = await clerkClient.signInTokens.createSignInToken({
      userId: user.clerkId,
      expiresInSeconds: 60,
    });
    return { ticket: signInToken.token };
  } catch (e) {
    return handleApiError(event, e);
  }
});
