import type { CalendarAccount } from "./types";

/**
 * What a connected account is called on screen. The name somebody gave it in settings when there
 * is one — "Work", "Personal" — and its address otherwise; the address stays as the second line
 * under a name, since two accounts called Work are told apart by nothing else.
 */
export function accountLabel(account: Pick<CalendarAccount, "email">, alias: string): string {
  return alias.trim() || account.email || "Unknown account";
}

/** The line under the name: the address, when the name isn't already the address. */
export function accountHint(account: Pick<CalendarAccount, "email">, alias: string): string | null {
  return alias.trim() && account.email ? account.email : null;
}

/** Whether typed text finds this account — by its name or by its address, anywhere in either. */
export function matchesAccount(account: Pick<CalendarAccount, "email">, alias: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return alias.toLowerCase().includes(needle) || (account.email ?? "").toLowerCase().includes(needle);
}
