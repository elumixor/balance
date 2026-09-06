import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "~/lib/env";
import { NotAuthenticatedError } from "~/lib/http/api-error";
import { clerkClient } from "./service";

/**
 * A native sign-in — Google or Apple, through the Capacitor SocialLogin plugin — bridged into a
 * Clerk session. clerk-js's own OAuth redirect flow needs an http(s) redirect, which the app's
 * WKWebView origin can't satisfy once the provider bounces the flow out to Safari, so the native
 * side proves the identity and this side mints a sign-in ticket the webview redeems with
 * `signIn.create({ strategy: "ticket" })`.
 *
 * Each provider is one verifier: it turns the token it was given into a verified email, or throws.
 */

/** A minute is enough for a ticket to cross from native code to the webview on the same phone. */
const TICKET_LIFETIME_SECONDS = 60;

type Verifier = (idToken: string) => Promise<string>;

async function signInTicket(verify: Verifier, idToken: string): Promise<{ ticket: string }> {
  const email = await verify(idToken);
  const existing = await clerkClient.users.getUserList({ emailAddress: [email] });
  const user =
    existing.data[0] ?? (await clerkClient.users.createUser({ emailAddress: [email], skipPasswordRequirement: true }));
  const signInToken = await clerkClient.signInTokens.createSignInToken({
    userId: user.id,
    expiresInSeconds: TICKET_LIFETIME_SECONDS,
  });
  return { ticket: signInToken.token };
}

const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

/** Sign in with Apple: the identity token checked against Apple's own keys. */
async function verifyApple(idToken: string): Promise<string> {
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience: env.APPLE_BUNDLE_ID,
  });
  const email = typeof payload.email === "string" ? payload.email : undefined;
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  if (!email || !emailVerified) throw new NotAuthenticatedError("Apple email not verified");
  return email;
}

interface GoogleTokenInfo {
  aud: string;
  email?: string;
  email_verified?: string;
}

/** Google Sign-In: the id token checked by Google's own tokeninfo endpoint. */
async function verifyGoogle(idToken: string): Promise<string> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw new NotAuthenticatedError("Invalid Google token");
  const info = (await response.json()) as GoogleTokenInfo;
  if (info.aud !== env.GOOGLE_IOS_CLIENT_ID) throw new NotAuthenticatedError("Invalid Google token audience");
  if (!info.email || info.email_verified !== "true") throw new NotAuthenticatedError("Google email not verified");
  return info.email;
}

export const appleSignIn = (idToken: string) => signInTicket(verifyApple, idToken);
export const googleSignIn = (idToken: string) => signInTicket(verifyGoogle, idToken);
