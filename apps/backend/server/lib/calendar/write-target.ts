import { ProviderNotConnectedError } from "./errors";
import { splitCalendarId } from "./ids";
import { type CalendarConnection, calendarConnections } from "./registry";
import { PRIMARY_CALENDAR_ID } from "./types";

/** One connected account and one of its calendars — where a write is going. */
export interface WriteTarget {
  readonly connection: CalendarConnection;
  readonly calendarId: string;
}

/** The calendars the grid draws for one account: what was chosen, or the primary until then. */
export function visibleCalendarIds(connection: CalendarConnection): string[] {
  const chosen = connection.account.visibleCalendarIds;
  return chosen.length > 0 ? chosen : [PRIMARY_CALENDAR_ID];
}

/**
 * Where dragged activities become events: the one account that has a write calendar set, or the
 * first live account's primary. Null only when no account is live at all.
 */
export function writeTarget(active: readonly CalendarConnection[]): WriteTarget | null {
  for (const connection of active) {
    const calendarId = connection.account.writeCalendarId;
    if (calendarId) return { connection, calendarId };
  }
  const first = active[0];
  return first ? { connection: first, calendarId: PRIMARY_CALENDAR_ID } : null;
}

/** Resolves a qualified calendar id to the live account that owns it — for an update or a delete. */
export async function targetFor(userId: string, qualifiedCalendarId: string): Promise<WriteTarget> {
  const { accountId, calendarId } = splitCalendarId(qualifiedCalendarId);
  const connections = await calendarConnections(userId);
  const connection = connections.find((c) => c.accountId === accountId && !c.account.revokedAt);
  if (!connection) throw new ProviderNotConnectedError("google");
  return { connection, calendarId };
}

/** Same idea for a create, except there may be no calendar id yet — the write target stands in. */
export async function resolveTarget(userId: string, qualifiedCalendarId?: string): Promise<WriteTarget> {
  if (qualifiedCalendarId) return targetFor(userId, qualifiedCalendarId);
  const active = (await calendarConnections(userId)).filter((c) => !c.account.revokedAt);
  const target = writeTarget(active);
  if (!target) throw new ProviderNotConnectedError("google");
  return target;
}
