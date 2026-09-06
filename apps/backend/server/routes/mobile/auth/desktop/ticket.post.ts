import { clerkClient } from "~/lib/auth/service";
import { authed } from "~/lib/http/authed";

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
const TICKET_LIFETIME_SECONDS = 60;

export default authed(async ({ user }) => {
  const signInToken = await clerkClient.signInTokens.createSignInToken({
    userId: user.clerkId,
    expiresInSeconds: TICKET_LIFETIME_SECONDS,
  });
  return { ticket: signInToken.token };
});
