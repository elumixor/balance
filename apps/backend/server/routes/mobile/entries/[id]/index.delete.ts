import { handler } from "@elumixor/nitro-client/server";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { EntriesService } from "../../../../lib/entries-service";

export default handler(async ({ router, event }) => {
  const id = router.id;
  const user = await getDbUserForRequest(event);
  await new EntriesService(user.id).deleteEntry(id);
  return { ok: true };
});
