import { ApiError } from "~/lib/http/api-error";

/**
 * A calendar id only means something alongside the account it came from — two connected Google
 * accounts each have their own "primary" — so every id that crosses the API boundary is qualified
 * with the account's own id. Nothing on this side of the boundary (the cache, event mappings, the
 * Google API calls themselves) ever sees a qualified id; Google's own ids are already globally
 * unique, so mappings stay keyed on the raw id alone.
 */
const SEPARATOR = "::";

export function qualifyCalendarId(accountId: string, calendarId: string): string {
  return `${accountId}${SEPARATOR}${calendarId}`;
}

export function splitCalendarId(qualified: string): { accountId: string; calendarId: string } {
  const at = qualified.indexOf(SEPARATOR);
  if (at === -1) throw new ApiError("That calendar isn't in your account");
  return { accountId: qualified.slice(0, at), calendarId: qualified.slice(at + SEPARATOR.length) };
}
