import { authed } from "~/lib/http/authed";
import { timeZoneField } from "~/lib/http/schemas";
import { PlanningService } from "~/lib/planning/service";

/**
 * The next two days of session reminders, each with the words it will show.
 *
 * The phone hands these straight to iOS: it is asleep when they fire, so nothing about them can be
 * decided at the time. Asked for on every foreground, and the whole list is replaced each time —
 * cheap, idempotent, and it means a preference changed on the Mac reaches the phone on unlock.
 */
export default authed({ query: { timeZone: timeZoneField } }, async ({ query, user }) => {
  const { enabled, slots } = await new PlanningService(user.id).notifications({ timeZone: query.timeZone });
  return {
    enabled,
    slots: slots.map((slot) => ({
      slot: slot.slot,
      day: slot.day,
      at: slot.at.toISOString(),
      title: slot.title,
      body: slot.body,
    })),
  };
});
