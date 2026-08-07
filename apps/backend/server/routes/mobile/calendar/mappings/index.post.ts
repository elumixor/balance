import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../../lib/api-error";
import { EventMappingService } from "../../../../lib/calendar/mappings-service";
import { getDbUserForRequest } from "../../../../lib/current-user";

export default handler(
  {
    body: {
      calendarId: z.string().min(1),
      externalEventId: z.string().min(1),
      scope: z.enum(["instance", "series"]),
      activityId: z.string().nullable().optional(),
      weights: z
        .array(z.object({ categoryId: z.string(), weightPercent: z.number().int().min(0).max(100) }))
        .optional(),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      const mapping = await new EventMappingService(user.id).upsert(body);
      return { mapping };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
