import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { dayField, timeZoneField } from "~/lib/http/schemas";
import { PlanningService } from "~/lib/planning/service";

/**
 * A day, committed — the moment the ritual actually pays.
 *
 * The coverage rule is checked here as well as in the panel: a disabled button is a courtesy, and
 * the star has to be earned. `rest` is the way out for a day that is deliberately empty; it keeps
 * the streak and earns the base star, and nothing else.
 */
export default authed(
  {
    body: {
      day: dayField,
      timeZone: timeZoneField,
      rest: z.boolean().optional(),
    },
  },
  async ({ body, user }) => new PlanningService(user.id).commitDay(body),
);
