import { z } from "zod";
import { splitCalendarId } from "~/lib/calendar/ids";
import { EventMappingService } from "~/lib/calendar/mappings-service";
import { authed } from "~/lib/http/authed";

export default authed(
  {
    body: {
      calendarId: z.string().min(1),
      externalEventId: z.string().min(1),
      scope: z.enum(["instance", "series"]),
    },
  },
  async ({ body, user }) => {
    await new EventMappingService(user.id).remove({ ...body, calendarId: splitCalendarId(body.calendarId).calendarId });
    return { ok: true };
  },
);
