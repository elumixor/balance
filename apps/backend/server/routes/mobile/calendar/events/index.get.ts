import { setResponseHeader } from "h3";
import { z } from "zod";
import { CalendarEventDTO } from "~/lib/calendar/dto";
import { CalendarEventsService } from "~/lib/calendar/events-service";
import { ApiError } from "~/lib/http/api-error";
import { authed } from "~/lib/http/authed";
import { parseInstantRange } from "~/lib/http/schemas";

/** A month of weeks either side of where you are is plenty; a year's worth is a mistake. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 62 * MS_PER_DAY;

export default authed({ query: { from: z.string(), to: z.string() } }, async ({ query, event, user }) => {
  const { start: from, end: to } = parseInstantRange(query.from, query.to);
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
});
