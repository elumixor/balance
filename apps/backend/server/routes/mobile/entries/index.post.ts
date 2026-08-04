import { handler } from "@elumixor/nitro-client/server";
import { and, eq } from "drizzle-orm";
import { setResponseStatus } from "h3";
import { z } from "zod";
import { db } from "../../../db";
import { activities } from "../../../db/schema";
import { ApiError, handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { EntryDTO } from "../../../lib/dto";
import { EntriesService } from "../../../lib/entries-service";

export default handler(
  {
    body: {
      activityId: z.string().min(1),
      startedAt: z.string(),
      endedAt: z.string(),
      note: z.string().nullable().optional(),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);

    try {
      const created = await new EntriesService(user.id).createManualEntry(body);

      const activity = await db.query.activities.findFirst({
        where: and(eq(activities.id, body.activityId), eq(activities.userId, user.id)),
      });

      setResponseStatus(event, 201);
      return { entry: new EntryDTO({ ...created, activity: activity! }) };
    } catch (e) {
      if (e instanceof Error && e.message === "Activity not found")
        return handleApiError(event, new ApiError(e.message, 404));
      return handleApiError(event, e);
    }
  },
);
