import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { ApiError, handleApiError } from "../../../../../lib/api-error";
import { CalendarEventsService } from "../../../../../lib/calendar/events-service";
import { getDbUserForRequest } from "../../../../../lib/current-user";
import { CalendarEventDTO } from "../../../../../lib/dto";

export default handler(
  {
    body: {
      calendarId: z.string().min(1),
      title: z.string().trim().optional(),
      description: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      location: z.string().optional(),
      timeZone: z.string().max(64).optional(),
      recurrence: z.array(z.string().max(400)).max(4).optional(),
      reminders: z
        .array(z.object({ method: z.enum(["popup", "email"]), minutes: z.number().int().min(0).max(40_320) }))
        .max(5)
        .optional(),
      attendees: z
        .array(z.object({ email: z.string().email(), optional: z.boolean().optional() }))
        .max(100)
        .optional(),
      conference: z.enum(["create", "remove"]).optional(),
      // Present only when the caller means the whole series, not just this occurrence.
      seriesId: z.string().optional(),
      previousStart: z.string().optional(),
      previousEnd: z.string().optional(),
    },
  },
  async ({ body, router, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      const start = parseInstant(body.start, "start");
      const end = parseInstant(body.end, "end");
      if (start && end && end <= start) throw new ApiError("An event has to end after it starts");

      const series = body.seriesId
        ? {
            seriesId: body.seriesId,
            previousStart: parseInstant(body.previousStart, "previousStart") ?? new Date(),
            previousEnd: parseInstant(body.previousEnd, "previousEnd") ?? new Date(),
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
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);

function parseInstant(value: string | undefined, field: string): Date | undefined {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApiError(`${field} must be a valid ISO 8601 instant`);
  return parsed;
}
