import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { handleApiError } from "../../../../../lib/api-error";
import { CalendarEventsService } from "../../../../../lib/calendar/events-service";
import { getDbUserForRequest } from "../../../../../lib/current-user";

export default handler({ body: { calendarId: z.string().min(1) } }, async ({ body, router, event }) => {
  const user = await getDbUserForRequest(event);
  try {
    await new CalendarEventsService(user.id).delete(body.calendarId, router.id);
    return { ok: true };
  } catch (e) {
    return handleApiError(event, e);
  }
});
