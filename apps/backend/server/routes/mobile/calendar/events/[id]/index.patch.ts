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
        { title: body.title, description: body.description, start, end },
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
