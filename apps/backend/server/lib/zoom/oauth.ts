import { env } from "~/lib/env";
import { ApiError, UpstreamError } from "~/lib/http/api-error";

const AUTHORIZE_ENDPOINT = "https://zoom.us/oauth/authorize";
const TOKEN_ENDPOINT = "https://zoom.us/oauth/token";

/** A grant as this app keeps it. Zoom's access tokens last an hour and its refresh tokens rotate. */
export interface ZoomGrant {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  reason?: string;
}

/** Raised when Zoom says the grant itself is done for, so the settings row can ask for another. */
export class ZoomAuthError extends ApiError {}

/**
 * Whether this deployment can talk to Zoom at all. The three keys are a switch: a deployment
 * without them is not broken, it simply doesn't offer Zoom, and every entry point says so.
 */
export function zoomConfigured() {
  return Boolean(env.ZOOM_OAUTH_CLIENT_ID && env.ZOOM_OAUTH_CLIENT_SECRET && env.ZOOM_OAUTH_REDIRECT_URI);
}

function keys() {
  const id = env.ZOOM_OAUTH_CLIENT_ID;
  const secret = env.ZOOM_OAUTH_CLIENT_SECRET;
  const redirectUri = env.ZOOM_OAUTH_REDIRECT_URI;
  if (!id || !secret || !redirectUri) throw new ApiError("Zoom isn't set up on this deployment");
  return { id, secret, redirectUri };
}

/**
 * Zoom's half of connecting. The same shape as the calendar's, because it is the same problem: a
 * consent screen the person actually sees, and an exchange that turns what comes back into a
 * grant this app can keep.
 */
export const zoomOAuth = {
  authUrl(state: string) {
    const { id, redirectUri } = keys();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: id,
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTHORIZE_ENDPOINT}?${params}`;
  },

  exchangeCode(code: string) {
    return request({ grant_type: "authorization_code", code, redirect_uri: keys().redirectUri });
  },

  /**
   * A grant renewed before it dies. Zoom rotates the refresh token on every renewal and refuses
   * the one it replaced, so what comes back has to be written before the next call uses it.
   */
  refresh(refreshToken: string) {
    return request({ grant_type: "refresh_token", refresh_token: refreshToken });
  },
};

async function request(body: Record<string, string>): Promise<ZoomGrant> {
  const { id, secret } = keys();
  const credentials = Buffer.from(`${id}:${secret}`).toString("base64");
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Basic ${credentials}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const answer = (await response.json()) as TokenResponse;

  if (!response.ok || !answer.access_token || !answer.refresh_token) {
    // What Zoom says to a grant that was revoked, has aged out, or has already been spent.
    if (answer.reason === "Invalid Token!" || answer.error === "invalid_grant") {
      throw new ZoomAuthError("That Zoom connection has expired.");
    }
    throw new UpstreamError(`Zoom refused the grant: ${answer.reason ?? answer.error ?? response.status}`);
  }

  return {
    accessToken: answer.access_token,
    refreshToken: answer.refresh_token,
    expiresAt: new Date(Date.now() + (answer.expires_in ?? 3600) * 1000),
  };
}
