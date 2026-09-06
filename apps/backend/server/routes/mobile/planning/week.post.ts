import { authed } from "~/lib/http/authed";
import { dayField, timeZoneField } from "~/lib/http/schemas";
import { PlanningService } from "~/lib/planning/service";

/** The Sunday sitting, committed. Flat pay — living the week it draws is what earns the rest. */
export default authed(
  {
    body: {
      weekStart: dayField,
      timeZone: timeZoneField,
    },
  },
  async ({ body, user }) => new PlanningService(user.id).commitWeek(body),
);
