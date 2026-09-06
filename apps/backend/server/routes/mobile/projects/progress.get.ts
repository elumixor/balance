import { setResponseHeader } from "h3";
import { authed } from "~/lib/http/authed";
import { dayField, timeZoneField } from "~/lib/http/schemas";
import { ProjectProgressService } from "~/lib/projects/progress-service";

/**
 * The evidence behind every project card: hours per week, the open gate's live count, and each
 * practice's adherence. The device names its day and zone, the same way the planning sessions
 * do, because a week is a week where the person is.
 */
export default authed({ query: { timeZone: timeZoneField, today: dayField } }, async ({ query, event, user }) => {
  const progress = await new ProjectProgressService(user.id, query.timeZone, query.today).compute();
  setResponseHeader(event, "cache-control", "private, no-store");
  return progress;
});
