import { z } from "zod";
import { goalsManager } from "~/lib/goals/access";
import { goalFields } from "~/lib/goals/schemas";
import { GoalService } from "~/lib/goals/service";

/** Changes a goal. A new ladder is replayed over everything already posted. */
export default goalsManager(
  {
    body: {
      title: goalFields.title.optional(),
      kind: goalFields.kind.optional(),
      metric: goalFields.metric.optional(),
      aggregate: goalFields.aggregate,
      cadence: goalFields.cadence,
      timeZone: goalFields.timeZone.optional(),
      levels: goalFields.levels.optional(),
      advanceAfter: goalFields.advanceAfter,
      easeAfter: goalFields.easeAfter,
      sphereId: goalFields.sphereId,
      archived: z.boolean().optional(),
    },
  },
  async ({ body, user, router }) => ({ goal: await new GoalService(user.id).update(router.id, body) }),
);
