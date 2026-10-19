import { setResponseHeader } from "h3";
import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { parseInstant } from "~/lib/http/schemas";
import { WatchDaysService } from "~/lib/watch/summary-service";

/** The watch's day pager: every timed event between two of the caller's own midnights. */
export default authed({ query: { from: z.string(), to: z.string() } }, async ({ query, event, user }) => {
  const days = await new WatchDaysService(user.id).days(parseInstant(query.from, "from"), parseInstant(query.to, "to"));
  setResponseHeader(event, "cache-control", "private, no-store");
  return days;
});
