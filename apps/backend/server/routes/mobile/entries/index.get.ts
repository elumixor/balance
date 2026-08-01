import { getQuery } from "h3";
import { getDbUserForRequest } from "../../../lib/current-user";
import { serializeEntry } from "../../../lib/dto";
import { getTrackDataForUser } from "../../../lib/entries-service";
import { defineApiHandler } from "../../../lib/handler";

export default defineApiHandler(async (event) => {
  const user = await getDbUserForRequest(event);
  const query = getQuery(event);
  const limitParam = Number(query.limit ?? "20");
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

  const data = await getTrackDataForUser(user.id, limit);

  return {
    entries: data.entries.map(serializeEntry),
    recentActivities: data.recentActivities,
    frequentActivities: data.frequentActivities,
  };
});
