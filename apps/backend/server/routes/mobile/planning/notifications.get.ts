import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../lib/api-error";
import { getDbUserForRequest } from "../../../lib/current-user";
import { PlanningService } from "../../../lib/planning/service";

/**
 * The next two days of session reminders, each with the words it will show.
 *
 * The phone hands these straight to iOS: it is asleep when they fire, so nothing about them can be
 * decided at the time. Asked for on every foreground, and the whole list is replaced each time —
 * cheap, idempotent, and it means a preference changed on the Mac reaches the phone on unlock.
 */
export default handler({ query: { timeZone: z.string().max(64) } }, async ({ query, event }) => {
  const user = await getDbUserForRequest(event);
  try {
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
  } catch (e) {
    return handleApiError(event, e);
  }
});
