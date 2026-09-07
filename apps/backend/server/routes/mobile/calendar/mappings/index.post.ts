import { z } from "zod";
import { splitCalendarId } from "~/lib/calendar/ids";
import { EventMappingService } from "~/lib/calendar/mappings-service";
import { authed } from "~/lib/http/authed";
import { integrationSourceField } from "~/lib/http/schemas";

const MAX_HIDDEN_SECTIONS = 20;
const MAX_SECTION_ID_LENGTH = 40;

export default authed(
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
      source: integrationSourceField.nullable().optional(),
      /** The card sections folded away on it. Absent leaves it alone; null means the default. */
      hidden: z.array(z.string().max(MAX_SECTION_ID_LENGTH)).max(MAX_HIDDEN_SECTIONS).nullable().optional(),
      /** Whether the person is at its location once it has happened. Absent leaves it alone. */
      placeChange: z.boolean().optional(),
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
  async ({ body, user }) => {
    const mapping = await new EventMappingService(user.id).upsert({
      ...body,
      calendarId: splitCalendarId(body.calendarId).calendarId,
    });
    return { mapping };
  },
);
