import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { PlanningService } from "../../../lib/planning/service";

/**
 * One session, whole: what went well, what is being planned, what it pays, and the words for it.
 *
 * The zone comes from the device because a planning day is a day in a place, and the server has no
 * other way to know which. Answers 200 with `connected: false` when there is no calendar yet —
 * a 401 is read by the app as a dead session and bounces it to sign-in.
 */
export default handler(
  { query: { slot: z.enum(["evening", "morning", "weekly"]), timeZone: z.string().max(64) } },
  async ({ query, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      return await new PlanningService(user.id).summary({ slot: query.slot, timeZone: query.timeZone });
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
