import { setResponseHeader } from "h3";
import { SphereProgressService } from "~/lib/categories/progress-service";
import { authed } from "~/lib/http/authed";
import { dayField, timeZoneField } from "~/lib/http/schemas";

/**
 * Each sphere's week against its target, projects under a sphere included: spent, still on the
 * calendar, and left. The device names its day and zone, because a week is a week where it is.
 */
export default authed({ query: { timeZone: timeZoneField, today: dayField } }, async ({ query, event, user }) => {
  const progress = await new SphereProgressService(user.id).week(query.today, query.timeZone);
  setResponseHeader(event, "cache-control", "private, no-store");
  return progress;
});
