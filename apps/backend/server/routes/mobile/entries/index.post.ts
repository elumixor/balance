import { and, eq } from "drizzle-orm";
import { readBody, setResponseStatus } from "h3";
import { db } from "../../../db";
import { activities } from "../../../db/schema";
import { ApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { serializeEntry } from "../../../lib/dto";
import { createManualEntryForUser, type ManualEntryInput } from "../../../lib/entries-service";
import { defineApiHandler } from "../../../lib/handler";

function parseBody(body: unknown): ManualEntryInput {
  if (typeof body !== "object" || body === null) throw new ApiError("Invalid entry payload");
  const b = body as Record<string, unknown>;
  if (typeof b.activityId !== "string" || !b.activityId) throw new ApiError("Invalid entry payload");
  if (typeof b.startedAt !== "string" || typeof b.endedAt !== "string") throw new ApiError("Invalid entry payload");
  if (b.note !== undefined && b.note !== null && typeof b.note !== "string") throw new ApiError("Invalid entry payload");
  return { activityId: b.activityId, startedAt: b.startedAt, endedAt: b.endedAt, note: b.note as string | null };
}

export default defineApiHandler(async (event) => {
  const user = await getDbUserForRequest(event);
  const input = parseBody(await readBody(event).catch(() => null));

  let created: Awaited<ReturnType<typeof createManualEntryForUser>>;
  try {
    created = await createManualEntryForUser(user.id, input);
  } catch (e) {
    if (e instanceof Error && e.message === "Activity not found") throw new ApiError(e.message, 404);
    throw e instanceof Error ? new ApiError(e.message) : e;
  }

  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, input.activityId), eq(activities.userId, user.id)),
  });

  setResponseStatus(event, 201);
  return { entry: serializeEntry({ ...created, activity: activity! }) };
});
