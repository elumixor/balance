import { z } from "zod";
import { CalendarPrefsService } from "~/lib/calendar/prefs-service";
import { authed } from "~/lib/http/authed";

export default authed(
  {
    body: {
      visibleCalendarIds: z.array(z.string()).optional(),
      writeCalendarId: z.string().optional(),
    },
  },
  async ({ body, user }) => {
    const { visibleCalendarIds, writeCalendarId } = await new CalendarPrefsService(user.id).update(body);
    return { visibleCalendarIds, writeCalendarId };
  },
);
