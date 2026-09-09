import { authed } from "~/lib/http/authed";
import { mcpTokenService } from "~/lib/mcp/tokens";

/** The keys this account has out, without the secrets — those existed once and weren't kept. */
export default authed(async ({ user }) => ({ keys: await mcpTokenService.list(user.id) }));
