import { setResponseStatus } from "h3";
import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { mcpTokenService } from "~/lib/mcp/tokens";

/**
 * Mints a key for an assistant. The secret is in this answer and nowhere else afterwards, so the
 * screen that asked has to show it now — there is no second chance to read it back.
 */
export default authed({ body: { name: z.string().trim().min(1).max(60) } }, async ({ body, event, user }) => {
  const issued = await mcpTokenService.issue(user.id, body.name);
  setResponseStatus(event, 201);
  return issued;
});
