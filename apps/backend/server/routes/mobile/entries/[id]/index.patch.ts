import { getRouterParam, readBody } from "h3";
import { ApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { serializeEntry } from "../../../../lib/dto";
import { updateEntryForUser, type ManualEntryInput } from "../../../../lib/entries-service";
import { defineApiHandler } from "../../../../lib/handler";
import { db } from "../../../../db";
import { activities } from "../../../../db/schema";
import { and, eq } from "drizzle-orm";

function parseBody(body: unknown): ManualEntryInput {
  if (typeof body !== "object" || body === null) throw new ApiError("Invalid entry payload");
  const b = body as Record<string, unknown>;
  if (typeof b.activityId !== "string" || !b.activityId) throw new ApiError("Invalid entry payload");
  if (typeof b.startedAt !== "string" || typeof b.endedAt !== "string") throw new ApiError("Invalid entry payload");
  if (b.note !== undefined && b.note !== null && typeof b.note !== "string") throw new ApiError("Invalid entry payload");
  return { activityId: b.activityId, startedAt: b.startedAt, endedAt: b.endedAt, note: b.note as string | null };
}

export default defineApiHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const user = await getDbUserForRequest(event);
  const input = parseBody(await readBody(event).catch(() => null));

  let updated: Awaited<ReturnType<typeof updateEntryForUser>>;
  try {
    updated = await updateEntryForUser(user.id, id, input);
  } catch (e) {
    if (e instanceof Error && (e.message === "Entry not found" || e.message === "Activity not found")) {
      throw new ApiError(e.message, 404);
    }
    throw e instanceof Error ? new ApiError(e.message) : e;
  }

  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, input.activityId), eq(activities.userId, user.id)),
  });

  return { entry: serializeEntry({ ...updated, activity: activity! }) };
});
