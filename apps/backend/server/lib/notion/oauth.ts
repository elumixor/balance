import { env } from "~/lib/env";
import { UpstreamError } from "~/lib/http/api-error";
import { NotionAuthError } from "./client";

const AUTHORIZE_ENDPOINT = "https://api.notion.com/v1/oauth/authorize";
const TOKEN_ENDPOINT = "https://api.notion.com/v1/oauth/token";

/** A grant, as this app keeps it. Older connections hand over a token that never expires. */
export interface NotionGrant {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: Date | null;
  readonly workspaceId: string;
  readonly workspaceName: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  workspace_id?: string;
  workspace_name?: string | null;
  error?: string;
  error_description?: string;
}

/**
 * Notion's half of connecting: a consent screen where somebody ticks the pages this app may read,
 * and the exchange that turns what comes back into a grant.
 *
 * Ticking the pages is the point of doing it this way. An access token would work as well for one
 * person, but it means pasting a secret into a text field and then sharing every database with it
 * by hand — two steps that go wrong quietly, in a place nothing can check them.
 */
export const notionOAuth = {
  authUrl(state: string) {
    const params = new URLSearchParams({
      client_id: env.NOTION_OAUTH_CLIENT_ID,
      redirect_uri: env.NOTION_OAUTH_REDIRECT_URI,
      response_type: "code",
      owner: "user",
      state,
    });
    return `${AUTHORIZE_ENDPOINT}?${params}`;
  },

  exchangeCode(code: string) {
    return request({ grant_type: "authorization_code", code, redirect_uri: env.NOTION_OAUTH_REDIRECT_URI });
  },

  /** A grant that has aged out, renewed. Notion rotates the refresh token, so both are kept. */
  refresh(refreshToken: string) {
    return request({ grant_type: "refresh_token", refresh_token: refreshToken });
  },
};

async function request(body: Record<string, string>): Promise<NotionGrant> {
  const credentials = Buffer.from(`${env.NOTION_OAUTH_CLIENT_ID}:${env.NOTION_OAUTH_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Basic ${credentials}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer = (await response.json()) as TokenResponse;

  if (!response.ok) {
    // The one answer Notion gives to a revoked, expired or already-used grant.
    if (answer.error === "invalid_grant") throw new NotionAuthError("That Notion connection has expired.");
    throw new UpstreamError(`Notion refused the grant: ${answer.error_description ?? answer.error ?? response.status}`);
  }

  return {
    accessToken: answer.access_token,
    refreshToken: answer.refresh_token ?? null,
    expiresAt: answer.expires_in ? new Date(Date.now() + answer.expires_in * 1000) : null,
    workspaceId: answer.workspace_id ?? "",
    workspaceName: answer.workspace_name ?? "Notion",
  };
}
