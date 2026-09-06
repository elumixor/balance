import { z } from "zod";
import { CalendarEventsService } from "~/lib/calendar/events-service";
import { authed } from "~/lib/http/authed";

export default authed({ body: { calendarId: z.string().min(1) } }, async ({ body, router, user }) => {
  await new CalendarEventsService(user.id).delete(body.calendarId, router.id);
  return { ok: true };
});
