import { clerkClient } from "~/lib/auth/service";
import { authed } from "~/lib/http/authed";

/**
 * Hands the phone's session over to the watch.
 *
 * The watch app talks to this API on its own — it is not a screen of the phone app — so it needs a
 * session of its own, and there is no way to sign in on a watch worth putting anyone through. So
 * the phone, already signed in, mints a sign-in ticket and passes it across Watch Connectivity;
 * the watch redeems it once and from then on holds its own Clerk session, which refreshes itself
 * whether or not the phone is nearby.
 *
 * An hour, rather than the minute a desktop ticket gets: this one is pushed toward a watch that
 * may be on a charger in another room, and it travels between two apps on the same paired devices
 * rather than through a URL anybody could read.
 */
const TICKET_LIFETIME_SECONDS = 60 * 60;

export default authed(async ({ user }) => {
  const signInToken = await clerkClient.signInTokens.createSignInToken({
    userId: user.clerkId,
    expiresInSeconds: TICKET_LIFETIME_SECONDS,
  });
  return { ticket: signInToken.token };
});
