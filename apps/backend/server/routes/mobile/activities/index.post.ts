import { handler } from "@elumixor/nitro-client/server";
import { eq } from "drizzle-orm";
import { setResponseStatus } from "h3";
import { z } from "zod";
import { db } from "../../../db";
import { activities } from "../../../db/schema";
import { ApiError, handleApiError } from "../../../lib/api-error";
import { ActivityService } from "../../../lib/categories-service";
import { getDbUserForRequest } from "../../../lib/current-user";
import { ActivityDTO } from "../../../lib/dto";

const weightSchema = z.object({ categoryId: z.string(), weightPercent: z.number() });

export default handler(
  {
    body: {
      name: z.string().trim().min(1),
      weights: z.array(weightSchema),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      const activity = await new ActivityService(user.id).create(body);

      const created = await db.query.activities.findFirst({
        where: eq(activities.id, activity.id),
        with: { weights: true },
      });
      if (!created) throw new ApiError("Failed to create activity", 500);

      setResponseStatus(event, 201);
      return { activity: new ActivityDTO(created) };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
