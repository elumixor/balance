import { goalTokenService } from "~/lib/goals/tokens";
import { authed } from "~/lib/http/authed";

/** Revokes an app's key at once. */
export default authed(async ({ user, router }) => {
  await goalTokenService.revoke(user.id, router.id);
  return { ok: true as const };
});
