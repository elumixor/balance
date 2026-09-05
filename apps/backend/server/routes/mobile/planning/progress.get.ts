import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { PlanningService } from "../../../lib/planning/service";

/**
 * The record behind the star: rank, streaks, what each rule has paid, the last four weeks as a
 * strip, and which achievements have landed. Read by the stars pane, which is the one place the
 * numbers are the subject rather than the backdrop.
 */
export default handler({ query: { timeZone: z.string().max(64) } }, async ({ query, event }) => {
  const user = await getDbUserForRequest(event);
  try {
    return await new PlanningService(user.id).progress({ timeZone: query.timeZone });
  } catch (e) {
    return handleApiError(event, e);
  }
});
