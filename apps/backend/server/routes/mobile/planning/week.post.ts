import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { PlanningService } from "../../../lib/planning/service";

/** The Sunday sitting, committed. Flat pay — living the week it draws is what earns the rest. */
export default handler(
  {
    body: {
      weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD"),
      timeZone: z.string().max(64),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      return await new PlanningService(user.id).commitWeek(body);
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
