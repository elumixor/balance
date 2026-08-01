import { getDbUserForRequest } from "../../../../lib/current-user";
import { stopTimerForUser } from "../../../../lib/entries-service";
import { defineApiHandler } from "../../../../lib/handler";

export default defineApiHandler(async (event) => {
  const user = await getDbUserForRequest(event);
  await stopTimerForUser(user.id);
  return { ok: true };
});
