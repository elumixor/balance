import { ApiError } from "~/lib/http/api-error";
import { CalendarDTO } from "./dto";
import { ProviderNotConnectedError } from "./errors";
import { eventCache } from "./event-cache";
import { qualifyCalendarId, splitCalendarId } from "./ids";
import { type CalendarConnection, calendarConnections } from "./registry";
import { PRIMARY_CALENDAR_ID } from "./types";
import { visibleCalendarIds, writeTarget } from "./write-target";

/** Which calendars the app reads and where it writes, as every screen sees them — qualified ids. */
export interface CalendarPrefsView {
  readonly connected: boolean;
  readonly needsReconnect: boolean;
  readonly visibleCalendarIds: string[];
  readonly writeCalendarId: string;
}

export interface CalendarAccountView {
  readonly accountId: string;
  readonly email: string | null;
  readonly needsReconnect: boolean;
  readonly calendars: CalendarDTO[];
}

/** The one projection of a user's connected accounts into "what's visible, where do writes go". */
export class CalendarPrefsService {
  constructor(private readonly userId: string) {}

  async view(): Promise<CalendarPrefsView> {
    return projectPrefs(await calendarConnections(this.userId));
  }

  /** The picker's answer: every account, with its calendars listed when its grant still works. */
  async accounts(): Promise<CalendarPrefsView & { accounts: CalendarAccountView[] }> {
    const connections = await calendarConnections(this.userId);
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
    return { ...projectPrefs(connections), accounts };
  }

  async update(input: { visibleCalendarIds?: string[]; writeCalendarId?: string }): Promise<CalendarPrefsView> {
    const active = (await calendarConnections(this.userId)).filter((c) => !c.account.revokedAt);
    if (active.length === 0) throw new ProviderNotConnectedError("google");

    if (input.writeCalendarId) await this.#setWriteCalendar(active, input.writeCalendarId);
    if (input.visibleCalendarIds) await this.#setVisibleCalendars(active, input.visibleCalendarIds);

    // Which calendars are read is part of what a week is, so a memo of the old set is stale.
    eventCache.invalidate(this.userId);
    return this.view();
  }

  async #setWriteCalendar(active: readonly CalendarConnection[], qualified: string) {
    const { accountId, calendarId } = splitCalendarId(qualified);
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

  async #setVisibleCalendars(active: readonly CalendarConnection[], qualifiedIds: readonly string[]) {
    const byAccount = new Map<string, string[]>();
    for (const qualified of qualifiedIds) {
      const { accountId, calendarId } = splitCalendarId(qualified);
      if (!active.some((c) => c.accountId === accountId)) continue;
      byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), calendarId]);
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
}

/** Qualified ids for the app, from the accounts as stored. Revoked accounts contribute nothing. */
export function projectPrefs(connections: readonly CalendarConnection[]): CalendarPrefsView {
  const active = connections.filter((c) => !c.account.revokedAt);
  const target = writeTarget(active);
  return {
    connected: active.length > 0,
    needsReconnect: connections.some((c) => c.account.revokedAt),
    visibleCalendarIds: active.flatMap((c) => visibleCalendarIds(c).map((id) => qualifyCalendarId(c.accountId, id))),
    writeCalendarId: target ? qualifyCalendarId(target.connection.accountId, target.calendarId) : PRIMARY_CALENDAR_ID,
  };
}
