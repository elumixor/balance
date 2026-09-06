import { setResponseHeader } from "h3";
import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { WatchSummaryService } from "~/lib/watch/summary-service";

/**
 * Everything a watch face draws in one round trip — see `lib/watch/summary-service.ts`. The week
 * is the caller's, not the server's: a watch sends its own local Monday midnight as an instant.
 */
export default authed({ query: { weekStart: z.string().optional() } }, async ({ query, event, user }) => {
  const summary = await new WatchSummaryService(user.id).summary(query.weekStart);
  // Per-user data behind a bearer token: no shared cache may ever hold it.
  setResponseHeader(event, "cache-control", "private, no-store");
  return summary;
});
