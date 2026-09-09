import { eventHandler, readBody, setResponseHeader, setResponseStatus } from "h3";
import { mcpOAuth, OAuthError, oauthErrorBody } from "~/lib/mcp/oauth";

/**
 * The token endpoint. Form-encoded, because that is what RFC 6749 says and what every client
 * sends; h3 parses either, so a client that sends JSON is not punished for it.
 *
 * No client authentication: every client registered here is a public one, and what proves the
 * exchange is the PKCE verifier rather than a secret nobody could have kept.
 */
export default eventHandler(async (event) => {
  const body = ((await readBody(event)) ?? {}) as Record<string, string | undefined>;
  setResponseHeader(event, "cache-control", "no-store");

  try {
    switch (body.grant_type) {
      case "authorization_code":
        return await mcpOAuth.exchangeCode({
          code: body.code ?? "",
          codeVerifier: body.code_verifier ?? "",
          clientId: body.client_id,
          redirectUri: body.redirect_uri,
        });
      case "refresh_token":
        return await mcpOAuth.exchangeRefresh({
          refreshToken: body.refresh_token ?? "",
          clientId: body.client_id,
        });
      default:
        throw new OAuthError("unsupported_grant_type", `${body.grant_type ?? "That grant"} is not supported here`);
    }
  } catch (error) {
    const { status, body: answer } = oauthErrorBody(error);
    setResponseStatus(event, status);
    return answer;
  }
});
