import { pad2 } from "$lib/ui/format";

/**
 * A clock as it is typed and as the calendar wants it.
 *
 * The time fields on the event card take "9", "930", "9:30" and "9.30" and hand on "09:30"; the
 * suggestions beside them are worked out in minutes since midnight, so an event that runs past
 * midnight is the same arithmetic as one that doesn't.
 */

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const LAST_HOUR = 23;
const LAST_MINUTE = 59;

/** "9", "930", "9:30", "9.30" — every way a time gets typed, as "09:30". Null when it isn't one. */
export function normalizeClock(text: string): string | null {
  const match = /^(\d{1,2})[:.]?(\d{2})?$/.exec(text.replace(/\s+/g, ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > LAST_HOUR || minutes > LAST_MINUTE) return null;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

/** Minutes since midnight, or null when the text isn't a time. */
export function toMinutes(text: string): number | null {
  const clock = normalizeClock(text);
  if (!clock) return null;
  return Number(clock.slice(0, 2)) * MINUTES_PER_HOUR + Number(clock.slice(3));
}

/** "HH:MM" for a count of minutes, wrapped into the day — 25 hours is one in the morning. */
export function toClock(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(wrapped / MINUTES_PER_HOUR))}:${pad2(wrapped % MINUTES_PER_HOUR)}`;
}

/** A span in minutes, counting an event that runs past midnight as landing the next day. */
export function spanBetween(startMinutes: number, endMinutes: number): number {
  const diff = endMinutes - startMinutes;
  return diff > 0 ? diff : diff + MINUTES_PER_DAY;
}
