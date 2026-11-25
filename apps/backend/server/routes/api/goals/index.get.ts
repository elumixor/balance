import { goalsReader } from "~/lib/goals/access";
import { GoalService } from "~/lib/goals/service";

/** Every live goal with the level it stands on, its streak and what it asks for next. */
export default goalsReader(async ({ user }) => ({ goals: await new GoalService(user.id).list() }));
