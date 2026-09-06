import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { timeZoneField } from "~/lib/http/schemas";
import { PlanningService } from "~/lib/planning/service";

/**
 * One session, whole: what went well, what is being planned, what it pays, and the words for it.
 *
 * The zone comes from the device because a planning day is a day in a place, and the server has no
 * other way to know which. Answers 200 with `connected: false` when there is no calendar yet —
 * a 401 is read by the app as a dead session and bounces it to sign-in.
 */
export default authed(
  { query: { slot: z.enum(["evening", "morning", "weekly"]), timeZone: timeZoneField } },
  async ({ query, user }) => new PlanningService(user.id).summary({ slot: query.slot, timeZone: query.timeZone }),
);
