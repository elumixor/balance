import { handler } from "@elumixor/nitro-client/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { ApiError, handleApiError } from "../../../../lib/api-error";
import { clerkClient } from "../../../../lib/current-user";

const APPLE_BUNDLE_ID = "com.elumixor.balance";
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

/**
 * Mirrors `google.post.ts`: bridges a native Sign in with Apple (Capacitor SocialLogin
 * plugin) into a Clerk session by verifying the identityToken against Apple's own keys,
 * then minting a Clerk sign-in ticket for the webview to redeem.
 */
export default handler({ body: { idToken: z.string().min(1) } }, async ({ body, event }) => {
  try {
    const { payload } = await jwtVerify(body.idToken, appleJwks, {
      issuer: "https://appleid.apple.com",
      audience: APPLE_BUNDLE_ID,
    });

    const email = typeof payload.email === "string" ? payload.email : undefined;
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";
    if (!email || !emailVerified) throw new ApiError("Apple email not verified", 401);

    const existing = await clerkClient.users.getUserList({ emailAddress: [email] });
    const user =
      existing.data[0] ??
      (await clerkClient.users.createUser({ emailAddress: [email], skipPasswordRequirement: true }));

    const signInToken = await clerkClient.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 60 });
    return { ticket: signInToken.token };
  } catch (e) {
    return handleApiError(event, e);
  }
});
