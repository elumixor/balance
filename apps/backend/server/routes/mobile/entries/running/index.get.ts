import { handler } from "@elumixor/nitro-client/server";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { EntryDTO } from "../../../../lib/dto";
import { EntriesService } from "../../../../lib/entries-service";

export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  const running = await new EntriesService(user.id).getRunningEntry();
  return { entry: running ? new EntryDTO(running) : null };
});
