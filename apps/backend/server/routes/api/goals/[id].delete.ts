import { goalsManager } from "~/lib/goals/access";
import { GoalService } from "~/lib/goals/service";

/** Removes a goal and every entry posted toward it. */
export default goalsManager(async ({ user, router }) => {
  await new GoalService(user.id).remove(router.id);
  return { ok: true as const };
});
