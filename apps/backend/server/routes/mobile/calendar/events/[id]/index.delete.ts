import { z } from "zod";
import { CalendarEventsService } from "~/lib/calendar/events-service";
import { authed } from "~/lib/http/authed";
import { parseInstant } from "~/lib/http/schemas";

export default authed(
  {
    body: {
      calendarId: z.string().min(1),
      // Present only when the caller means the series, or this occurrence and the ones after it.
      seriesId: z.string().optional(),
      seriesScope: z.enum(["all", "following"]).optional(),
      occurrenceStart: z.string().optional(),
      // The series a single occurrence belongs to, so a series left with one is made a one-off.
      occurrenceOf: z.string().optional(),
    },
  },
  async ({ body, router, user }) => {
    const series = body.seriesId
      ? {
          seriesId: body.seriesId,
          scope: body.seriesScope ?? "all",
          occurrenceStart: body.occurrenceStart ? parseInstant(body.occurrenceStart, "occurrenceStart") : new Date(),
        }
      : undefined;
    await new CalendarEventsService(user.id).delete(body.calendarId, router.id, series, body.occurrenceOf);
    return { ok: true };
  },
);
