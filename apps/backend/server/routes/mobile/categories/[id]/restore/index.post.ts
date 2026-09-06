import { CategoryService } from "~/lib/categories/service";
import { authed } from "~/lib/http/authed";

export default authed(async ({ router, user }) => {
  await new CategoryService(user.id).restore(router.id);
  return { ok: true };
});
