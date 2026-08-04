import { handler } from "@elumixor/nitro-client/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../db";
import { activities } from "../../../../db/schema";
import { ApiError, handleApiError } from "../../../../lib/api-error";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { EntryDTO } from "../../../../lib/dto";
import { EntriesService } from "../../../../lib/entries-service";

export default handler(
  {
    body: {
      activityId: z.string().min(1),
      startedAt: z.string(),
      endedAt: z.string(),
      note: z.string().nullable().optional(),
    },
  },
  async ({ body, router, event }) => {
    const id = router.id;
    const user = await getDbUserForRequest(event);

    try {
      const updated = await new EntriesService(user.id).updateEntry(id, body);

      const activity = await db.query.activities.findFirst({
        where: and(eq(activities.id, body.activityId), eq(activities.userId, user.id)),
      });

      return { entry: new EntryDTO({ ...updated, activity: activity! }) };
    } catch (e) {
      if (e instanceof Error && (e.message === "Entry not found" || e.message === "Activity not found")) {
        return handleApiError(event, new ApiError(e.message, 404));
      }
      return handleApiError(event, e);
    }
  },
);
