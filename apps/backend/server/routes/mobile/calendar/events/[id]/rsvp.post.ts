import { z } from "zod";
import { CalendarEventDTO } from "~/lib/calendar/dto";
import { CalendarEventsService } from "~/lib/calendar/events-service";
import { authed } from "~/lib/http/authed";

/** Answering an invitation: yes, no, or maybe, written back to the calendar everyone else reads. */
export default authed(
  {
    body: {
      calendarId: z.string().min(1),
      response: z.enum(["accepted", "declined", "tentative"]),
    },
  },
  async ({ body, router, user }) => {
    const updated = await new CalendarEventsService(user.id).respond(body.calendarId, router.id, body.response);
    return { event: new CalendarEventDTO(updated) };
  },
);
