import { GoogleCalendarProvider } from "./google/calendar-provider";
import { type ProviderAccount, ProviderAccountService } from "./provider-accounts";
import type { CalendarProvider } from "./types";

/** One connected account, alongside the stored grant and preferences behind it. */
export interface CalendarConnection {
  readonly accountId: string;
  readonly provider: CalendarProvider;
  readonly account: ProviderAccount;
  readonly accounts: ProviderAccountService;
}

export const GOOGLE = "google";

/**
 * Google is the only provider today; a second one becomes another branch here rather than a
 * change anywhere downstream, which is the whole point of `CalendarProvider`. A user can connect
 * several Google accounts, so this always returns every one of them, revoked ones included —
 * callers decide whether a dead grant is worth surfacing or worth skipping.
 */
export async function calendarConnections(userId: string): Promise<CalendarConnection[]> {
  const accounts = new ProviderAccountService(userId);
  const rows = await accounts.list(GOOGLE);
  return rows.map((account) => ({
    accountId: account.id,
    provider: new GoogleCalendarProvider(accounts, account.id, account.scopes),
    account,
    accounts,
  }));
}
