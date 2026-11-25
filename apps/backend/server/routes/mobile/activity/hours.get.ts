import { setResponseHeader } from "h3";
import { ActivityService } from "~/lib/activity/service";
import { keyed } from "~/lib/http/authed";
import { dayField, timeZoneField } from "~/lib/http/schemas";

/**
 * The week containing `today`, per sphere: the target, what the calendar holds, and what was
 * actually observed so far. The caller names its day and zone, because a week is a week where it is.
 */
export default keyed({ query: { timeZone: timeZoneField, today: dayField } }, async ({ query, event, user }) => {
  const hours = await new ActivityService(user.id).hours(query.today, query.timeZone);
  setResponseHeader(event, "cache-control", "private, no-store");
  return hours;
});
