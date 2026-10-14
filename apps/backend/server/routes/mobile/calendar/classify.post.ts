import { z } from "zod";
import { EventClassificationService } from "~/lib/calendar/classify-service";
import { ApiError } from "~/lib/http/api-error";
import { authed } from "~/lib/http/authed";
import { parseInstantRange } from "~/lib/http/schemas";

/** A screen's window: a week, or a phone's three days, with room for a jump either side. */
const MAX_RANGE_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * Files the window's grey blocks that nobody has asked the decision model about yet. Answers how
 * many it filed, so the screen knows whether its week is worth fetching again.
 */
export default authed({ body: { from: z.string(), to: z.string() } }, async ({ body, user }) => {
  const { start: from, end: to } = parseInstantRange(body.from, body.to);
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) throw new ApiError("That's too long a range to file at once");
  return new EventClassificationService(user.id).classify(from, to);
});
