import { ActivityService } from "~/lib/categories/service";
import { authed } from "~/lib/http/authed";

export default authed(async ({ router, user }) => {
  await new ActivityService(user.id).restore(router.id);
  return { ok: true };
});
