import { handler } from "@elumixor/nitro-client/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { activities } from "../../../db/schema";
import { getDbUserForRequest } from "../../../lib/current-user";
import { ActivityDTO } from "../../../lib/dto";

export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);

  const rows = await db.query.activities.findMany({
    where: and(eq(activities.userId, user.id), eq(activities.archived, false)),
    orderBy: asc(activities.createdAt),
    with: { weights: true },
  });

  return { activities: rows.map((a) => new ActivityDTO(a)) };
});
