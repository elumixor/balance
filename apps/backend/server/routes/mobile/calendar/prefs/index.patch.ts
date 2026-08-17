import { handler } from "@elumixor/nitro-client/server";
import { z } from "zod";
import { ApiError, handleApiError } from "../../../../lib/api-error";
import { eventCache } from "../../../../lib/calendar/event-cache";
import { qualifyCalendarId } from "../../../../lib/calendar/events-service";
import { calendarConnections } from "../../../../lib/calendar/registry";
import { PRIMARY_CALENDAR_ID } from "../../../../lib/calendar/types";
import { getDbUserForRequest } from "../../../../lib/current-user";

function splitCalendarId(qualified: string): { accountId: string; calendarId: string } {
  const at = qualified.indexOf("::");
  if (at === -1) throw new ApiError("That calendar isn't in your account");
  return { accountId: qualified.slice(0, at), calendarId: qualified.slice(at + 2) };
}

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
      const connections = await calendarConnections(user.id);
      const active = connections.filter((c) => !c.account.revokedAt);
      if (active.length === 0) throw new ApiError("No calendar is connected", 409);

      if (body.writeCalendarId) {
        const { accountId, calendarId } = splitCalendarId(body.writeCalendarId);
        const connection = active.find((c) => c.accountId === accountId);
        if (!connection) throw new ApiError("That calendar isn't in your account");

        if (calendarId !== PRIMARY_CALENDAR_ID) {
          const calendars = await connection.provider.listCalendars();
          const target = calendars.find((c) => c.id === calendarId);
          if (!target) throw new ApiError("That calendar isn't in your account");
          if (target.readOnly) throw new ApiError(`You can only read ${target.name}, so events can't be added to it`);
        }
        await connection.accounts.setPrefs(accountId, { writeCalendarId: calendarId });
      }

      if (body.visibleCalendarIds) {
        const byAccount = new Map<string, string[]>();
        for (const qualified of body.visibleCalendarIds) {
          const { accountId, calendarId } = splitCalendarId(qualified);
          if (!active.some((c) => c.accountId === accountId)) continue;
          const list = byAccount.get(accountId) ?? [];
          list.push(calendarId);
          byAccount.set(accountId, list);
        }
        // Every active account gets its own subset written — one not mentioned in the new list
        // means every one of its calendars was just unchecked, not "leave it alone".
        await Promise.all(
          active.map((connection) =>
            connection.accounts.setPrefs(connection.accountId, {
              visibleCalendarIds: byAccount.get(connection.accountId) ?? [],
            }),
          ),
        );
      }

      eventCache.invalidate(user.id);

      const refreshed = (await calendarConnections(user.id)).filter((c) => !c.account.revokedAt);
      const visibleCalendarIds = refreshed.flatMap((c) =>
        (c.account.visibleCalendarIds.length > 0 ? c.account.visibleCalendarIds : [PRIMARY_CALENDAR_ID]).map((id) =>
          qualifyCalendarId(c.accountId, id),
        ),
      );
      const writeSource = refreshed.find((c) => c.account.writeCalendarId) ?? refreshed[0];
      const writeCalendarId = writeSource
        ? qualifyCalendarId(writeSource.accountId, writeSource.account.writeCalendarId ?? PRIMARY_CALENDAR_ID)
        : PRIMARY_CALENDAR_ID;

      return { visibleCalendarIds, writeCalendarId };
    } catch (e) {
      return handleApiError(event, e);
    }
  },
);
