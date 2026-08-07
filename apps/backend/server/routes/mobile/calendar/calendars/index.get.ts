import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../../lib/api-error";
import { calendarConnection } from "../../../../lib/calendar/registry";
import { PRIMARY_CALENDAR_ID } from "../../../../lib/calendar/types";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { CalendarDTO } from "../../../../lib/dto";

/** Fetched only when the picker is opened or the app starts — not on every week. */
export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    const connection = await calendarConnection(user.id);
    if (!connection || connection.account.revokedAt) {
      return {
        connected: false,
        needsReconnect: Boolean(connection?.account.revokedAt),
        calendars: [],
        visibleCalendarIds: [],
        writeCalendarId: PRIMARY_CALENDAR_ID,
      };
    }

    const calendars = await connection.provider.listCalendars();
    return {
      connected: true,
      needsReconnect: false,
      calendars: calendars.map((c) => new CalendarDTO(c)),
      visibleCalendarIds: connection.account.visibleCalendarIds,
      writeCalendarId: connection.account.writeCalendarId ?? PRIMARY_CALENDAR_ID,
    };
  } catch (e) {
    return handleApiError(event, e);
  }
});
