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
      /** The integration feed it is linked to. Absent leaves it alone; null unlinks. */
      source: z
        .string()
        .regex(/^[a-z][a-z0-9-]{1,40}:[a-z][a-z0-9-]{1,40}$/)
        .nullable()
        .optional(),
      /** The card sections folded away on it. Absent leaves it alone; null means the default. */
      hidden: z.array(z.string().max(40)).max(20).nullable().optional(),
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
