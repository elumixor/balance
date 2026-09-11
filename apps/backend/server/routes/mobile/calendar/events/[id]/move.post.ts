import { z } from "zod";
import { CalendarEventDTO } from "~/lib/calendar/dto";
import { CalendarEventsService } from "~/lib/calendar/events-service";
import { authed } from "~/lib/http/authed";

/**
 * Changes who hosts the event by handing it to another calendar — the app's one way of saying
 * "this is the other account's meeting now". A repeating event moves as a series, since a rule
 * lives on its master; the caller says which series that is.
 */
export default authed(
  {
    body: {
      calendarId: z.string().min(1),
      destinationCalendarId: z.string().min(1),
      seriesId: z.string().optional(),
    },
  },
  async ({ body, router, user }) => {
    const moved = await new CalendarEventsService(user.id).move(
      body.calendarId,
      router.id,
      body.destinationCalendarId,
      body.seriesId,
    );
    return { event: new CalendarEventDTO(moved) };
  },
);
