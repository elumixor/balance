import { CategoryDTO } from "~/lib/categories/dto";
import { CategoryService } from "~/lib/categories/service";
import { authed } from "~/lib/http/authed";

export default authed(async ({ user }) => {
  const rows = await new CategoryService(user.id).list();
  return { categories: rows.map((c) => new CategoryDTO(c)) };
});
