import { handler } from "@elumixor/nitro-client/server";
import { handleApiError } from "../../../../lib/api-error";
import { qualifyCalendarId } from "../../../../lib/calendar/events-service";
import { calendarConnections } from "../../../../lib/calendar/registry";
import { PRIMARY_CALENDAR_ID } from "../../../../lib/calendar/types";
import { getDbUserForRequest } from "../../../../lib/current-user";
import { CalendarDTO } from "../../../../lib/dto";

/** Fetched only when the picker is opened or the app starts — not on every week. */
export default handler(async ({ event }) => {
  const user = await getDbUserForRequest(event);
  try {
    const connections = await calendarConnections(user.id);
    const active = connections.filter((c) => !c.account.revokedAt);

    if (connections.length === 0) {
      return {
        connected: false,
        needsReconnect: false,
        accounts: [],
        visibleCalendarIds: [],
        writeCalendarId: PRIMARY_CALENDAR_ID,
      };
    }

    const accounts = await Promise.all(
      connections.map(async (connection) => ({
        accountId: connection.accountId,
        email: connection.account.email,
        needsReconnect: Boolean(connection.account.revokedAt),
        calendars: connection.account.revokedAt
          ? []
          : (await connection.provider.listCalendars()).map((c) => new CalendarDTO(c, connection.accountId)),
      })),
    );

    const visibleCalendarIds = active.flatMap((connection) =>
      (connection.account.visibleCalendarIds.length > 0
        ? connection.account.visibleCalendarIds
        : [PRIMARY_CALENDAR_ID]
      ).map((id) => qualifyCalendarId(connection.accountId, id)),
    );
    const writeSource = active.find((c) => c.account.writeCalendarId) ?? active[0];
    const writeCalendarId = writeSource
      ? qualifyCalendarId(writeSource.accountId, writeSource.account.writeCalendarId ?? PRIMARY_CALENDAR_ID)
      : PRIMARY_CALENDAR_ID;

    return {
      connected: active.length > 0,
      needsReconnect: active.length === 0,
      accounts,
      visibleCalendarIds,
      writeCalendarId,
    };
  } catch (e) {
    return handleApiError(event, e);
  }
});
