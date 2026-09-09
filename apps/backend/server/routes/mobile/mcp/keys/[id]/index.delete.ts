import { authed } from "~/lib/http/authed";
import { mcpTokenService } from "~/lib/mcp/tokens";

export default authed(async ({ router, user }) => {
  await mcpTokenService.revoke(user.id, router.id);
  return { ok: true };
});
