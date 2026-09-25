import { setResponseHeader } from "h3";
import { z } from "zod";
import { CalendarSearchService } from "~/lib/calendar/search-service";
import { authed } from "~/lib/http/authed";

/** The events a few typed words find, for the palette. Nearest to today first, a dozen at most. */
export default authed({ query: { q: z.string().trim().min(1) } }, async ({ query, event, user }) => {
  const hits = await new CalendarSearchService(user.id).search(query.q);
  // Somebody's calendar behind a bearer token: no shared cache may ever hold it.
  setResponseHeader(event, "cache-control", "private, no-store");
  return { hits };
});
