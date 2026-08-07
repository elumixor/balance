import { handler } from "@elumixor/nitro-client/server";
import { setResponseHeader } from "h3";
import { z } from "zod";
import { ApiError, handleApiError } from "../../../../lib/api-error";
import { CalendarEventsService } from "../../../../lib/calendar/events-service";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { CalendarEventDTO } from "../../../../lib/dto";

/** A month of weeks either side of where you are is plenty; a year's worth is a mistake. */
const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;

export default handler({ query: { from: z.string(), to: z.string() } }, async ({ query, event }) => {
  const user = await getDbUserForRequest(event);
  try {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new ApiError("from and to must be valid ISO 8601 instants");
    }
    if (to <= from) throw new ApiError("to must be after from");
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) throw new ApiError("That's too long a range to ask for at once");

    const range = await new CalendarEventsService(user.id).resolve(from, to);

    // Per-user data behind a bearer token: no shared cache may ever hold it.
    setResponseHeader(event, "cache-control", "private, no-store");
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      connected: range.connected,
      needsReconnect: range.needsReconnect,
      writeCalendarId: range.writeCalendarId,
      events: range.events.map((e) => new CalendarEventDTO(e)),
    };
  } catch (e) {
    return handleApiError(event, e);
  }
});
