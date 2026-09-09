import { type H3Event, setResponseHeader } from "h3";
import { type DbUser, resolveUser } from "~/lib/auth/service";
import { NotAuthenticatedError } from "~/lib/http/api-error";
import { MCP_TOKEN_PREFIX, mcpTokenService } from "./tokens";

const BEARER = /^Bearer (.+)$/;

/**
 * Whose account an MCP call is about.
 *
 * Not `authed`: the caller is a terminal or a chat that was configured once and is expected to
 * still work next month, and a Clerk session token is minutes long. It holds an MCP key instead —
 * minted in settings, shown once, checked here.
 *
 * The refusal carries a plain `WWW-Authenticate: Bearer`, and deliberately no
 * `resource_metadata`: there is no authorization server behind this, and pointing a client at a
 * discovery document that does not exist sends it down an OAuth dance that cannot finish.
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
  setResponseHeader(event, "www-authenticate", 'Bearer realm="balance"');
}
