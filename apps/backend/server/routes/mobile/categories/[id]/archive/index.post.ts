import { CategoryService } from "~/lib/categories/service";
import { authed } from "~/lib/http/authed";

export default authed(async ({ router, user }) => {
  await new CategoryService(user.id).archive(router.id);
  return { ok: true };
});
