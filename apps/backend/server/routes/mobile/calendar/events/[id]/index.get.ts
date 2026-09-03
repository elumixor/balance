import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../../../lib/api-error";
import { CalendarEventsService } from "../../../../../lib/calendar/events-service";
import { getDbUserForRequest } from "../../../../../lib/current-user";
import { CalendarEventDTO } from "../../../../../lib/dto";

/**
 * One event by id — asked for a series' master, which is the only event carrying the rule the
 * series repeats by. The week's own listing expands occurrences and never sees the master.
 */
export default handler({ query: { calendarId: z.string().min(1) } }, async ({ query, router, event }) => {
  const user = await getDbUserForRequest(event);
  try {
    const found = await new CalendarEventsService(user.id).get(query.calendarId, router.id);
    return { event: new CalendarEventDTO(found) };
  } catch (e) {
    return handleApiError(event, e);
  }
});
