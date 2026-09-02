import { handler } from "@elumixor/nitro-client/server";
import { setResponseHeader } from "h3";
import { z } from "zod";
import { ApiError, handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { ProjectProgressService } from "../../../lib/projects/progress-service";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The evidence behind every project card: hours per week, the open gate's live count, and each
 * practice's adherence. The device names its day and zone, the same way the planning sessions
 * do, because a week is a week where the person is.
 */
export default handler({ query: { timeZone: z.string(), today: z.string() } }, async ({ query, event }) => {
  const user = await getDbUserForRequest(event);
  try {
    if (!DAY.test(query.today)) throw new ApiError("today must be YYYY-MM-DD");
    const progress = await new ProjectProgressService(user.id, query.timeZone, query.today).compute();
    setResponseHeader(event, "cache-control", "private, no-store");
    return progress;
  } catch (e) {
    return handleApiError(event, e);
  }
});
