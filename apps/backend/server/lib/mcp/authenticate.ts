import { getRequestURL, type H3Event, setResponseHeader } from "h3";
import { type DbUser, resolveUser } from "~/lib/auth/service";
import { NotAuthenticatedError } from "~/lib/http/api-error";
import { SCOPE } from "./oauth";
import { MCP_TOKEN_PREFIX, mcpTokenService } from "./tokens";

const BEARER = /^Bearer (.+)$/;

/**
 * Whose account an MCP call is about.
 *
 * Not `authed`: the caller is a terminal or a chat that was configured once and is expected to
 * still work next month, and a Clerk session token is minutes long. It holds an MCP key instead —
 * minted in settings, shown once, checked here.
 *
 * The refusal carries `WWW-Authenticate` with `resource_metadata`, which is the whole of how a
 * client that was given nothing but a URL finds its way to the consent screen: it reads the
 * document that header names, finds the authorization server, and comes back with a token.
 */
export async function authenticateMcp(event: H3Event): Promise<DbUser> {
  const header = event.headers.get("authorization") ?? event.headers.get("Authorization");
  const token = header?.match(BEARER)?.[1];

  try {
    // Anything that isn't one of our keys is handed to the ordinary session check, so a browser
    // client with a live Clerk token works — and so does `DEV_AUTH_EMAIL`, which is what makes
    // this endpoint testable on a laptop without minting anything.
    if (!token?.startsWith(MCP_TOKEN_PREFIX)) return await resolveUser(event);
    return await mcpTokenService.resolve(token);
  } catch (error) {
    if (error instanceof NotAuthenticatedError) challenge(event);
    throw error;
  }
}

function challenge(event: H3Event) {
  const metadata = `${getRequestURL(event).origin}/.well-known/oauth-protected-resource/mcp`;
  setResponseHeader(
    event,
    "www-authenticate",
    `Bearer realm="balance", resource_metadata="${metadata}", scope="${SCOPE}"`,
  );
}
