import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { PlanningService } from "../../../lib/planning/service";

/**
 * A day, committed — the moment the ritual actually pays.
 *
 * The coverage rule is checked here as well as in the panel: a disabled button is a courtesy, and
 * the star has to be earned. `rest` is the way out for a day that is deliberately empty; it keeps
 * the streak and earns the base star, and nothing else.
 */
export default handler(
  {
    body: {
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "day must be YYYY-MM-DD"),
      timeZone: z.string().max(64),
      rest: z.boolean().optional(),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      return await new PlanningService(user.id).commitDay(body);
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
