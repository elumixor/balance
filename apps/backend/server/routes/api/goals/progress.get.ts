import { z } from "zod";
import { goalsReader } from "~/lib/goals/access";
import { GoalService } from "~/lib/goals/service";
import { parseInstant } from "~/lib/http/schemas";

const MAX_ENTRIES = 500;

/** The entries posted toward one goal or all of them, newest first. */
export default goalsReader(
  {
    query: {
      goal: z.string().min(1).max(64).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(MAX_ENTRIES).optional(),
    },
  },
  async ({ query, user }) => ({
    entries: await new GoalService(user.id).entries({
      goal: query.goal,
      from: query.from ? parseInstant(query.from, "from") : undefined,
      to: query.to ? parseInstant(query.to, "to") : undefined,
      limit: query.limit,
    }),
  }),
);
