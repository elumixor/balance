import { goalsReader } from "~/lib/goals/access";
import { GoalService } from "~/lib/goals/service";

/** Each goal's streak: how many periods in a row, the best so far, and whether it is waiting on this one. */
export default goalsReader(async ({ user }) => ({ streaks: await new GoalService(user.id).streaks() }));
