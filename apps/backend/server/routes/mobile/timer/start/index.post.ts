import { handler } from "@elumixor/nitro-client/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../db";
import { activities } from "../../../../db/schema";
import { ApiError, handleApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { EntryDTO } from "../../../../lib/dto";
import { EntriesService } from "../../../../lib/entries-service";

export default handler({ body: { activityId: z.string().min(1) } }, async ({ body, event }) => {
  const user = await getDbUserForRequest(event);

  try {
    const created = await new EntriesService(user.id).startTimer(body.activityId);

    const activity = await db.query.activities.findFirst({
      where: and(eq(activities.id, body.activityId), eq(activities.userId, user.id)),
    });

    return { entry: new EntryDTO({ ...created, activity: activity! }) };
  } catch (e) {
    if (e instanceof Error && e.message === "Activity not found")
      return handleApiError(event, new ApiError(e.message, 404));
    return handleApiError(event, e);
  }
});
