import { z } from "zod";
import { CalendarEventDTO } from "~/lib/calendar/dto";
import { CalendarEventsService } from "~/lib/calendar/events-service";
import { authed } from "~/lib/http/authed";
import { parseInstant, parseInstantRange, timeZoneField } from "~/lib/http/schemas";

/** Google's own ceiling on a reminder: four weeks ahead, in minutes. */
const MAX_REMINDER_MINUTES = 40_320;
const MAX_REMINDERS = 5;
const MAX_ATTENDEES = 100;
const MAX_RRULE_LINES = 4;
const MAX_RRULE_LENGTH = 400;

export default authed(
  {
    body: {
      calendarId: z.string().min(1),
      title: z.string().trim().optional(),
      description: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      location: z.string().optional(),
      timeZone: timeZoneField.optional(),
      recurrence: z.array(z.string().max(MAX_RRULE_LENGTH)).max(MAX_RRULE_LINES).optional(),
      reminders: z
        .array(
          z.object({
            method: z.enum(["popup", "email"]),
            minutes: z.number().int().min(0).max(MAX_REMINDER_MINUTES),
          }),
        )
        .max(MAX_REMINDERS)
        .optional(),
      attendees: z
        .array(
          z.object({
            email: z.string().email(),
            optional: z.boolean().optional(),
          }),
        )
        .max(MAX_ATTENDEES)
        .optional(),
      conference: z.enum(["create", "remove"]).optional(),
      // Present only when the caller means the whole series, not just this occurrence.
      seriesId: z.string().optional(),
      seriesScope: z.enum(["all", "following"]).optional(),
      previousStart: z.string().optional(),
      previousEnd: z.string().optional(),
    },
  },
  async ({ body, router, user }) => {
    const range = body.start && body.end ? parseInstantRange(body.start, body.end, ["start", "end"]) : undefined;
    const start = range?.start ?? (body.start ? parseInstant(body.start, "start") : undefined);
    const end = range?.end ?? (body.end ? parseInstant(body.end, "end") : undefined);

    const series = body.seriesId
      ? {
          seriesId: body.seriesId,
          scope: body.seriesScope ?? "all",
          previousStart: body.previousStart ? parseInstant(body.previousStart, "previousStart") : new Date(),
          previousEnd: body.previousEnd ? parseInstant(body.previousEnd, "previousEnd") : new Date(),
        }
      : undefined;

    const updated = await new CalendarEventsService(user.id).update(
      body.calendarId,
      router.id,
      {
        title: body.title,
        description: body.description,
        start,
        end,
        location: body.location,
        timeZone: body.timeZone,
        recurrence: body.recurrence,
        reminders: body.reminders,
        attendees: body.attendees,
        conference: body.conference,
      },
      series,
    );
    return { event: new CalendarEventDTO(updated) };
  },
);
