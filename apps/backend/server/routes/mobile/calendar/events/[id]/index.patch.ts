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
      title: z.string().trim().min(1).optional(),
      start: z.string().optional(),
      end: z.string().optional(),
    },
  },
  async ({ body, router, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      const start = parseInstant(body.start, "start");
      const end = parseInstant(body.end, "end");
      if (start && end && end <= start) throw new ApiError("An event has to end after it starts");

      const updated = await new CalendarEventsService(user.id).update(body.calendarId, router.id, {
        title: body.title,
        start,
        end,
      });
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
