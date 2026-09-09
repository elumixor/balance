import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { mcpOAuth } from "~/lib/mcp/oauth";

/** Who is asking, for the consent screen — and a first check that the request is one we'd answer. */
export default authed({ query: { clientId: z.string().min(1), redirectUri: z.string().min(1) } }, async ({ query }) =>
  mcpOAuth.describeClient(query.clientId, query.redirectUri),
);
