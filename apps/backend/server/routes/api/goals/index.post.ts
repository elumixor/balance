import { goalsManager } from "~/lib/goals/access";
import { goalFields, goalKeyField, goalStartField } from "~/lib/goals/schemas";
import { GoalService } from "~/lib/goals/service";

/** Makes a goal. `key` is what an app names it by from then on. */
export default goalsManager(
  { body: { ...goalFields, key: goalKeyField, startsOn: goalStartField } },
  async ({ body, user }) => ({ goal: await new GoalService(user.id).create(body) }),
);
