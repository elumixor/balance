import { and, eq } from "drizzle-orm";
import { getRouterParam } from "h3";
import { db } from "../../../../../db";
import { activities } from "../../../../../db/schema";
import { getDbUserForRequest } from "../../../../../lib/current-user";
import { defineApiHandler } from "../../../../../lib/handler";

export default defineApiHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const user = await getDbUserForRequest(event);

  await db
    .update(activities)
    .set({ archived: true })
    .where(and(eq(activities.id, id), eq(activities.userId, user.id)));

  return { ok: true };
});
