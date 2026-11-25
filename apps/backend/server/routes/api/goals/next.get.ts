import { goalsReader } from "~/lib/goals/access";
import { GoalService } from "~/lib/goals/service";

/** The one goal to do next and the sentence that asks for it; `next` is null once every goal is met. */
export default goalsReader(async ({ user }) => new GoalService(user.id).next());
