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

/**
 * A span as it is typed: "6m", "45m", "1h", "1h30", "1h30m", "1.5h", or "+90" for plain minutes.
 * A marker is required — a bare "930" is a time of day, not fifteen and a half hours.
 */
export function parseDuration(text: string): number | null {
  const trimmed = text.replace(/\s+/g, "").toLowerCase();
  const plus = trimmed.startsWith("+");
  const body = plus ? trimmed.slice(1) : trimmed;
  const hoursAndMinutes = /^(\d+(?:\.\d+)?)h(\d{1,2})?m?$/.exec(body);
  const minutesOnly = /^(\d+)m$/.exec(body);
  const bare = plus && /^\d+$/.test(body) ? body : null;

  let minutes: number | null = null;
  if (hoursAndMinutes) {
    minutes = Math.round(Number(hoursAndMinutes[1]) * MINUTES_PER_HOUR) + Number(hoursAndMinutes[2] ?? 0);
  } else if (minutesOnly) minutes = Number(minutesOnly[1]);
  else if (bare !== null) minutes = Number(bare);

  if (minutes === null || minutes <= 0 || minutes > MINUTES_PER_DAY) return null;
  return minutes;
}

/**
 * What one end of an event means when it has been typed into: a time of day as given, or — when
 * a span was typed instead — that span from the other end, forward for the end and back for the
 * start. Null when it reads as neither, or as a span with nothing to measure it from.
 */
export function entryToClock(text: string, other: number | null, end: boolean): string | null {
  const clock = normalizeClock(text);
  if (clock) return clock;
  const minutes = parseDuration(text);
  if (minutes === null || other === null) return null;
  return toClock(end ? other + minutes : other - minutes);
}
