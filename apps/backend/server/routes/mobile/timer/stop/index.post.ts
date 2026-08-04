import { handler } from "@elumixor/nitro-client/server";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { EntriesService } from "../../../../lib/entries-service";

export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  await new EntriesService(user.id).stopTimer();
  return { ok: true };
});
