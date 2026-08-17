import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../../lib/api-error";
import { splitCalendarId } from "../../../../lib/calendar/events-service";
import { EventMappingService } from "../../../../lib/calendar/mappings-service";
import { getDbUserForRequest } from "../../../../lib/current-user";

export default handler(
  {
    body: {
      calendarId: z.string().min(1),
      externalEventId: z.string().min(1),
      scope: z.enum(["instance", "series"]),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      await new EventMappingService(user.id).remove({
        ...body,
        calendarId: splitCalendarId(body.calendarId).calendarId,
      });
      return { ok: true };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
