import { handler } from "@elumixor/nitro-client/server";
import { setResponseStatus } from "h3";
import { z } from "zod";
import { ApiError, handleApiError } from "../../../../lib/api-error";
import { CalendarEventsService } from "../../../../lib/calendar/events-service";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { CalendarEventDTO } from "../../../../lib/dto";

export default handler(
  {
    body: {
      activityId: z.string().min(1),
      start: z.string(),
      end: z.string(),
      calendarId: z.string().optional(),
      title: z.string().trim().min(1).optional(),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      const start = new Date(body.start);
      const end = new Date(body.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new ApiError("start and end must be valid ISO 8601 instants");
      }
      if (end <= start) throw new ApiError("An event has to end after it starts");

      const created = await new CalendarEventsService(user.id).createFromActivity({ ...body, start, end });
      setResponseStatus(event, 201);
      return { event: new CalendarEventDTO(created) };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
