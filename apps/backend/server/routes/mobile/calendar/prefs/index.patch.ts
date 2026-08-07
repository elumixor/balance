import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { ApiError, handleApiError } from "../../../../lib/api-error";
import { eventCache } from "../../../../lib/calendar/event-cache";
import { calendarConnection } from "../../../../lib/calendar/registry";
import { PRIMARY_CALENDAR_ID } from "../../../../lib/calendar/types";
import { getDbUserForRequest } from "../../../../lib/current-user";

export default handler(
  {
    body: {
      visibleCalendarIds: z.array(z.string()).optional(),
      writeCalendarId: z.string().optional(),
    },
  },
  async ({ body, event }) => {
    const user = await getDbUserForRequest(event);
    try {
      const connection = await calendarConnection(user.id);
      if (!connection) throw new ApiError("No calendar is connected", 409);

      if (body.writeCalendarId && body.writeCalendarId !== PRIMARY_CALENDAR_ID) {
        const calendars = await connection.provider.listCalendars();
        const target = calendars.find((c) => c.id === body.writeCalendarId);
        if (!target) throw new ApiError("That calendar isn't in your account");
        if (target.readOnly) throw new ApiError(`You can only read ${target.name}, so events can't be added to it`);
      }

      const account = await connection.accounts.setPrefs("google", body);
      eventCache.invalidate(user.id);
      return {
        visibleCalendarIds: account.visibleCalendarIds,
        writeCalendarId: account.writeCalendarId ?? PRIMARY_CALENDAR_ID,
      };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
