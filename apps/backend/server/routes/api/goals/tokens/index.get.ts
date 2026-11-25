import { goalTokenService } from "~/lib/goals/tokens";
import { authed } from "~/lib/http/authed";

/** The keys apps hold for this account's goals, without their secrets. */
export default authed(async ({ user }) => ({ keys: await goalTokenService.list(user.id) }));
