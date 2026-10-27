import { z } from "zod";
import { splitCalendarId } from "~/lib/calendar/ids";
import { EventMappingService } from "~/lib/calendar/mappings-service";
import { authed } from "~/lib/http/authed";
import { integrationSourceField, urnField } from "~/lib/http/schemas";

const MAX_HIDDEN_SECTIONS = 20;
const MAX_SECTION_ID_LENGTH = 40;
/** Room for a full postal address as Maps spells it. */
const MAX_END_LOCATION_LENGTH = 500;
/** Long enough for a page of preparation, short enough that nobody writes a document in it. */
const MAX_NOTES_LENGTH = 10_000;

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
      practiceId: z.string().nullable().optional(),
      /** The work it was for in another app — `keep:page/<id>`. Absent leaves it; null clears it. */
      urn: urnField.nullable().optional(),
      /** The integration feed it is linked to. Absent leaves it alone; null unlinks. */
      source: integrationSourceField.nullable().optional(),
      /** The card sections folded away on it. Absent leaves it alone; null means the default. */
      hidden: z.array(z.string().max(MAX_SECTION_ID_LENGTH)).max(MAX_HIDDEN_SECTIONS).nullable().optional(),
      /** Where the person is once it is over. Absent leaves it alone; null clears it. */
      endLocation: z.string().trim().min(1).max(MAX_END_LOCATION_LENGTH).nullable().optional(),
      /** The person's own notes, which the calendar never sees. Absent leaves them; null clears. */
      notes: z.string().max(MAX_NOTES_LENGTH).nullable().optional(),
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
