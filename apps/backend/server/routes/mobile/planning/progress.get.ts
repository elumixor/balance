import { authed } from "~/lib/http/authed";
import { timeZoneField } from "~/lib/http/schemas";
import { PlanningService } from "~/lib/planning/service";

/**
 * The record behind the star: rank, streaks, what each rule has paid, the last four weeks as a
 * strip, and which achievements have landed. Read by the stars pane, which is the one place the
 * numbers are the subject rather than the backdrop.
 */
export default authed({ query: { timeZone: timeZoneField } }, async ({ query, user }) =>
  new PlanningService(user.id).progress({ timeZone: query.timeZone }),
);
