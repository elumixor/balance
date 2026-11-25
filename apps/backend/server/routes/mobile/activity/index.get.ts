import { setResponseHeader } from "h3";
import { z } from "zod";
import { ActivityService } from "~/lib/activity/service";
import { keyed } from "~/lib/http/authed";
import { parseInstantRange } from "~/lib/http/schemas";

/**
 * What actually happened in `[from, to)`: every observation and every calendar block that has
 * begun, and the lane they settle into — one sphere per stretch, with who said so.
 */
export default keyed({ query: { from: z.string(), to: z.string() } }, async ({ query, event, user }) => {
  const { start, end } = parseInstantRange(query.from, query.to);
  const timeline = await new ActivityService(user.id).timeline(start, end);
  setResponseHeader(event, "cache-control", "private, no-store");
  return timeline;
});
