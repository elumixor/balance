import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../../../lib/api-error";
import { CalendarEventsService } from "../../../../../lib/calendar/events-service";
import { getDbUserForRequest } from "../../../../../lib/current-user";
import { CalendarEventDTO } from "../../../../../lib/dto";

/** Answering an invitation: yes, no, or maybe, written back to the calendar everyone else reads. */
export default handler(
  {
    body: {
      calendarId: z.string().min(1),
      response: z.enum(["accepted", "declined", "tentative"]),
    },
  },
  async ({ body, router, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      const updated = await new CalendarEventsService(user.id).respond(body.calendarId, router.id, body.response);
      return { event: new CalendarEventDTO(updated) };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
