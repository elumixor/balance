import { handler } from "@elumixor/nitro-client/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../db";
import { activities } from "../../../../db/schema";
import { ApiError, handleApiError } from "../../../../lib/api-error";
import { ActivityService } from "../../../../lib/categories-service";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { ActivityDTO } from "../../../../lib/dto";

const weightSchema = z.object({ categoryId: z.string(), weightPercent: z.number() });

export default handler(
  {
    body: {
      name: z.string().trim().min(1),
      weights: z.array(weightSchema),
    },
  },
  async ({ body, router, event }) => {
    const id = router.id;
    const user = await getDbUserForRequest(event);

    try {
      const existing = await db.query.activities.findFirst({
        where: and(eq(activities.id, id), eq(activities.userId, user.id)),
      });
      if (!existing) throw new ApiError("Activity not found", 404);

      await new ActivityService(user.id).update(id, body);

      const updated = await db.query.activities.findFirst({
        where: eq(activities.id, id),
        with: { weights: true },
      });
      if (!updated) throw new ApiError("Activity not found", 404);

      return { activity: new ActivityDTO(updated) };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
