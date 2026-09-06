import { decodeJwt } from "jose";
import { ProviderNeedsReconnectError } from "~/lib/calendar/errors";
import { env } from "~/lib/env";
import { UpstreamError } from "~/lib/http/api-error";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/**
 * Deliberately narrower than the blanket `calendar` scope: reading and writing events, plus the
 * calendar list, is everything the app does. Both are sensitive scopes, neither is restricted.
 */
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

export interface TokenSet {
  readonly accessToken: string;
  /** Absent when Google decides we already have one — only a fresh consent hands it over. */
  readonly refreshToken?: string;
  readonly expiresAt: Date;
  readonly scopes: string;
}

export interface GoogleIdentity {
  readonly sub: string;
  readonly email?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

function credentials() {
  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
  };
}

async function requestTokens(params: Record<string, string>): Promise<TokenSet> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await response.json()) as TokenResponse & { error?: string; error_description?: string };

  if (!response.ok) {
    // `invalid_grant` is Google's single answer to revoked, expired and already-used grants.
    if (body.error === "invalid_grant") throw new ProviderNeedsReconnectError("google");
    throw new UpstreamError(`Google rejected the token request: ${body.error_description ?? body.error}`);
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: body.scope,
  };
}

class GoogleOAuthService {
  authUrl(state: string): string {
    const { clientId, redirectUri } = credentials();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      // "consent" alone reuses whichever Google account the browser is already signed into,
      // without it a returning user is sent back without a refresh token and the connection
      // silently dies an hour later; "select_account" is what lets a second account be chosen.
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
    });
    return `${AUTH_ENDPOINT}?${params}`;
  }

  async exchangeCode(code: string): Promise<{ tokens: TokenSet; identity: GoogleIdentity }> {
    const { clientId, clientSecret, redirectUri } = credentials();
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const body = (await response.json()) as TokenResponse & { error?: string; error_description?: string };
    if (!response.ok) {
      throw new UpstreamError(`Google rejected the sign-in: ${body.error_description ?? body.error}`);
    }
    if (!body.refresh_token) {
      throw new UpstreamError("Google didn't return a refresh token — try disconnecting and connecting again");
    }
    if (!body.id_token) throw new UpstreamError("Google didn't say which account this is");

    const claims = decodeJwt(body.id_token);
    if (!claims.sub) throw new UpstreamError("Google didn't say which account this is");
    return {
      tokens: {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: new Date(Date.now() + body.expires_in * 1000),
        scopes: body.scope,
      },
      identity: { sub: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined },
    };
  }

  refresh(refreshToken: string): Promise<TokenSet> {
    const { clientId, clientSecret } = credentials();
    return requestTokens({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    });
  }

  /** Best effort: a grant the user already revoked their side answers 400, which is fine. */
  async revoke(token: string): Promise<void> {
    await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {
      // Best effort by design: the row is deleted either way, and a grant Google no longer
      // recognises is already what disconnecting was for.
    });
  }
}

export const googleOAuthService = new GoogleOAuthService();
