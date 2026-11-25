import { z } from "zod";
import { goalScopesField, goalSourceField } from "~/lib/goals/schemas";
import { goalTokenService } from "~/lib/goals/tokens";
import { authed } from "~/lib/http/authed";

/**
 * Mints a key for one app. Only a signed-in person can: a key cannot make another key. The secret
 * is in this answer and nowhere afterwards.
 */
export default authed(
  { body: { name: z.string().trim().min(1).max(80), source: goalSourceField, scopes: goalScopesField.optional() } },
  async ({ body, user }) => goalTokenService.issue(user.id, { ...body, scopes: body.scopes ?? ["read", "progress"] }),
);
