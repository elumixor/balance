import { GoogleCalendarProvider } from "./google/calendar-provider";
import { type ProviderAccount, ProviderAccountService } from "./provider-accounts";
import type { CalendarProvider } from "./types";

/** The provider a user has connected, alongside the stored grant and preferences behind it. */
export interface CalendarConnection {
  readonly provider: CalendarProvider;
  readonly account: ProviderAccount;
  readonly accounts: ProviderAccountService;
}

const GOOGLE = "google";

/**
 * Google is the only provider today; a second one becomes another branch here rather than a
 * change anywhere downstream, which is the whole point of `CalendarProvider`.
 */
export async function calendarConnection(userId: string): Promise<CalendarConnection | null> {
  const accounts = new ProviderAccountService(userId);
  const account = await accounts.get(GOOGLE);
  if (!account) return null;
  return { provider: new GoogleCalendarProvider(accounts), account, accounts };
}
