import { ActivityDTO } from "~/lib/categories/dto";
import { ActivityService } from "~/lib/categories/service";
import { authed } from "~/lib/http/authed";

export default authed(async ({ user }) => {
  const rows = await new ActivityService(user.id).list();
  return { activities: rows.map((a) => new ActivityDTO(a)) };
});
