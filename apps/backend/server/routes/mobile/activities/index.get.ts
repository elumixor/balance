import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { activities } from "../../../db/schema";
import { getDbUserForRequest } from "../../../lib/current-user";
import { serializeActivity } from "../../../lib/dto";
import { defineApiHandler } from "../../../lib/handler";

export default defineApiHandler(async (event) => {
  const user = await getDbUserForRequest(event);

  const rows = await db.query.activities.findMany({
    where: and(eq(activities.userId, user.id), eq(activities.archived, false)),
    orderBy: asc(activities.createdAt),
    with: { weights: true },
  });

  return { activities: rows.map(serializeActivity) };
});
