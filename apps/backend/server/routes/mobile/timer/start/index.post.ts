import { readBody } from "h3";
import { db } from "../../../../db";
import { activities } from "../../../../db/schema";
import { and, eq } from "drizzle-orm";
import { ApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { serializeEntry } from "../../../../lib/dto";
import { startTimerForUser } from "../../../../lib/entries-service";
import { defineApiHandler } from "../../../../lib/handler";

export default defineApiHandler(async (event) => {
  const user = await getDbUserForRequest(event);
  const body = await readBody(event).catch(() => null);
  const activityId = typeof body === "object" && body !== null ? (body as Record<string, unknown>).activityId : null;
  if (typeof activityId !== "string" || !activityId) throw new ApiError("activityId is required");

  let created: Awaited<ReturnType<typeof startTimerForUser>>;
  try {
    created = await startTimerForUser(user.id, activityId);
  } catch (e) {
    if (e instanceof Error && e.message === "Activity not found") throw new ApiError(e.message, 404);
    throw e instanceof Error ? new ApiError(e.message) : e;
  }

  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, activityId), eq(activities.userId, user.id)),
  });

  return { entry: serializeEntry({ ...created, activity: activity! }) };
});
