import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "../api-error";
import { env } from "../env";

const TTL_MS = 10 * 60 * 1000;

/** Where the consent flow was started from, which decides what the callback page does at the end. */
export type ConnectMode = "app" | "web";

export interface OAuthState {
  readonly userId: string;
  readonly mode: ConnectMode;
  /** Where the app is running, so the callback can hand the browser back to it. */
  readonly origin: string;
  readonly exp: number;
}

/**
 * The origin is only ever the app's own — a signed-in user's browser told us where it was — but
 * the callback turns it into a redirect, so it stays confined to the shapes the app can have.
 */
export function isAppOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

/**
 * The browser that lands on the OAuth callback carries no Clerk bearer and no cookie of ours,
 * so the `state` parameter is the only thing that says whose account this grant belongs to.
 * Signing it is what makes that safe to trust.
 */
function sign(payload: string): string {
  return createHmac("sha256", env.OAUTH_STATE_SECRET).update(payload).digest("base64url");
}

export function signOAuthState(state: Omit<OAuthState, "exp">): string {
  const payload = Buffer.from(JSON.stringify({ ...state, exp: Date.now() + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyOAuthState(state: string): OAuthState {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new ApiError("Malformed sign-in state", 400);

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ApiError("Sign-in state failed its signature check", 400);
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as OAuthState;
  if (decoded.exp < Date.now()) throw new ApiError("This sign-in link has expired — start again", 400);
  return decoded;
}
