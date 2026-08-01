import { getDbUserForRequest } from "../../../../lib/current-user";
import { serializeEntry } from "../../../../lib/dto";
import { getRunningEntryForUser } from "../../../../lib/entries-service";
import { defineApiHandler } from "../../../../lib/handler";

export default defineApiHandler(async (event) => {
  const user = await getDbUserForRequest(event);
  const running = await getRunningEntryForUser(user.id);
  return { entry: running ? serializeEntry(running) : null };
});
