import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { clerkClient } from "../../../../lib/current-user";
import { ApiError, handleApiError } from "../../../../lib/api-error";

const GOOGLE_IOS_CLIENT_ID = "836194369955-5vudcjgcu637ma5bje6idu96emjm0f1a.apps.googleusercontent.com";

interface GoogleTokenInfo {
  aud: string;
  email?: string;
  email_verified?: string;
  sub: string;
}

/**
 * Bridges a native Google Sign-In (Capacitor SocialLogin plugin) into a Clerk session:
 * verify the idToken with Google, then mint a Clerk sign-in ticket the webview's clerk-js
 * can redeem with `signIn.create({ strategy: "ticket" })`. Needed because clerk-js's own
 * OAuth redirect flow requires an http/https redirectUrl, which the app's WKWebView origin
 * (https://localhost) can't satisfy once Google bounces the flow out to Safari.
 */
export default handler({ body: { idToken: z.string().min(1) } }, async ({ body, event }) => {
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.idToken)}`);
    if (!response.ok) throw new ApiError("Invalid Google token", 401);
    const info = (await response.json()) as GoogleTokenInfo;

    if (info.aud !== GOOGLE_IOS_CLIENT_ID) throw new ApiError("Invalid Google token audience", 401);
    if (!info.email || info.email_verified !== "true") throw new ApiError("Google email not verified", 401);

    const existing = await clerkClient.users.getUserList({ emailAddress: [info.email] });
    const user =
      existing.data[0] ??
      (await clerkClient.users.createUser({ emailAddress: [info.email], skipPasswordRequirement: true }));

    const signInToken = await clerkClient.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 60 });
    return { ticket: signInToken.token };
  } catch (e) {
    return handleApiError(event, e);
  }
});
