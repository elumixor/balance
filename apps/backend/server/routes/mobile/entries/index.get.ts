import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { getDbUserForRequest } from "../../../lib/current-user";
import { EntryDTO } from "../../../lib/dto";
import { EntriesService } from "../../../lib/entries-service";

export default handler({ query: { limit: z.coerce.number().optional() } }, async ({ query, event }) => {
  const user = await getDbUserForRequest(event);
  const limitParam = query.limit ?? 20;
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

  const data = await new EntriesService(user.id).getTrackData(limit);

  return {
    entries: data.entries.map((e) => new EntryDTO(e)),
    recentActivities: data.recentActivities,
    frequentActivities: data.frequentActivities,
  };
});
