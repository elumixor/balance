import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../../lib/api-error";
import { splitCalendarId } from "../../../../lib/calendar/events-service";
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
      /** What the hour was for. Absent leaves it alone; null clears it. */
      projectId: z.string().nullable().optional(),
      practiceId: z.string().nullable().optional(),
      taskId: z.string().nullable().optional(),
      /** How a timer for it is broken up. Absent leaves it alone; null clears it. */
      timer: z
        .union([
          z.object({ kind: z.literal("every"), minutes: z.number().int().positive() }),
          z.object({ kind: z.literal("parts"), count: z.number().int().min(2) }),
        ])
        .nullable()
        .optional(),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      const mapping = await new EventMappingService(user.id).upsert({
        ...body,
        calendarId: splitCalendarId(body.calendarId).calendarId,
      });
      return { mapping };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
