import { getRouterParam } from "h3";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { deleteEntryForUser } from "../../../../lib/entries-service";
import { defineApiHandler } from "../../../../lib/handler";

export default defineApiHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const user = await getDbUserForRequest(event);
  await deleteEntryForUser(user.id, id);
  return { ok: true };
});
