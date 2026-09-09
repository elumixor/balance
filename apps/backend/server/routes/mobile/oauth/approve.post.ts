import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { mcpOAuth } from "~/lib/mcp/oauth";

/**
 * The person said yes, on a page that needed their session to draw. Everything the token exchange
 * will check is written down against the code here; what comes back is where to send the browser.
 */
export default authed(
  {
    body: {
      /** "deny" is an answer too, and one the client is entitled to be told about. */
      decision: z.enum(["allow", "deny"]),
      clientId: z.string().min(1),
      redirectUri: z.string().min(1),
      codeChallenge: z.string().min(1),
      codeChallengeMethod: z.string().optional(),
      state: z.string().optional(),
      scope: z.string().optional(),
      resource: z.string().optional(),
    },
  },
  async ({ body, user }) => ({
    redirectTo: body.decision === "allow" ? await mcpOAuth.approve(user.id, body) : await mcpOAuth.refuse(body),
  }),
);
