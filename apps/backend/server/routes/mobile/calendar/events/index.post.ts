import { setResponseStatus } from "h3";
import { z } from "zod";
import { CalendarEventDTO } from "~/lib/calendar/dto";
import { CalendarEventsService } from "~/lib/calendar/events-service";
import { authed } from "~/lib/http/authed";
import { parseInstantRange, urnField } from "~/lib/http/schemas";

export default authed(
  {
    body: {
      activityId: z.string().min(1).optional(),
      /** For a block that counts straight toward categories rather than as one activity. */
      weights: z
        .array(z.object({ categoryId: z.string(), weightPercent: z.number().int().min(0).max(100) }))
        .optional(),
      practiceId: z.string().min(1).optional(),
      /** The work it is for in another app — `kip:page/<id>`. */
      urn: urnField.optional(),
      /** How a timer for it is broken up. Absent leaves it alone; null clears it. */
      timer: z
        .union([
          z.object({ kind: z.literal("every"), minutes: z.number().int().positive() }),
          z.object({ kind: z.literal("parts"), count: z.number().int().min(2) }),
        ])
        .nullable()
        .optional(),
      start: z.string(),
      end: z.string(),
      calendarId: z.string().optional(),
      title: z.string().trim().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      /** An all-day event: both instants are read as dates, and `end` is the day after the last. */
      allDay: z.boolean().optional(),
    },
  },
  async ({ body, event, user }) => {
    const { start, end } = parseInstantRange(body.start, body.end, ["start", "end"]);
    const created = await new CalendarEventsService(user.id).create({ ...body, start, end });
    setResponseStatus(event, 201);
    return { event: new CalendarEventDTO(created) };
  },
);
