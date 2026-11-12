import { ApiError } from "~/lib/http/api-error";

/**
 * All-day events are dates, not moments, and the date somebody means is the one they wrote.
 *
 * "2026-11-23T00:00:00+01:00" is the 23rd, even though the instant it names is the 22nd in UTC:
 * an ISO 8601 string carries its wall-clock date in its own text, whatever the offset after it,
 * so the date is read from there and never from the instant. A bare "2026-11-23" is the same day.
 *
 * The dates leave here the way `CreateEventInput.allDay` carries them, as midnight UTC, with the
 * end exclusive.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;
const MIDNIGHT = /T00:00(?::00(?:\.0+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const DAY_MS = 86_400_000;

export interface AllDayRange {
  readonly start: Date;
  readonly end: Date;
}

/** The wall-clock date an ISO 8601 date or date-time names, as midnight UTC. */
export function wallDate(value: string, field: string): Date {
  const match = ISO_DATE.exec(value.trim());
  if (!match || Number.isNaN(new Date(value.trim()).getTime())) {
    throw new ApiError(`${field} must be a date (YYYY-MM-DD) or an ISO 8601 date-time`);
  }
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ApiError(`${field} is not a real date`);
  }
  return date;
}

/**
 * The exclusive end date an `end` names. A date, or midnight, is already exclusive — that is how
 * Google and iCalendar write it — but "23:59 on the 23rd" means the 23rd is included, so a time of
 * day past midnight ends the event the day after.
 */
function exclusiveEnd(value: string, field: string): Date {
  const date = wallDate(value, field);
  const trimmed = value.trim();
  const dateOnly = trimmed.length === 10;
  return dateOnly || MIDNIGHT.test(trimmed) ? date : addDays(date, 1);
}

/**
 * The two dates of an all-day event, from what a caller wrote. Without an `end` the event lasts
 * `days` (one by default, or as long as it already was when it is being moved). An end on the
 * start day itself means that one day, the way a person writes "the 23rd to the 23rd".
 */
export function allDayRange(start: string, end: string | undefined, days = 1): AllDayRange {
  const from = wallDate(start, "start");
  if (end === undefined) return { start: from, end: addDays(from, Math.max(1, days)) };
  const to = exclusiveEnd(end, "end");
  if (to < from) throw new ApiError("end must be after start");
  return { start: from, end: to.getTime() === from.getTime() ? addDays(from, 1) : to };
}

/** How many whole days an all-day event spans, from the instants it was read back as. */
export function spanDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

/**
 * The `YYYY-MM-DD` an instant standing for an all-day date is written as. Such an instant is
 * midnight somewhere: midnight UTC when it was made here, midnight in the calendar's zone when it
 * was read back from Google (see `zonedDateToInstant`). Taking the UTC date straight off the
 * second kind is what put an event read back in Prague a day early. With the calendar's zone the
 * answer is exact; without it, rounding to the nearest UTC midnight is right for every zone within
 * twelve hours of Greenwich.
 */
export function calendarDate(at: Date, timeZone?: string): string {
  const ms = at.getTime();
  if (ms % DAY_MS === 0 || !timeZone) return new Date(Math.round(ms / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/**
 * One end of an event as Google takes it in a patch: a bare date for an all-day event — a
 * date-time on one is what Google refuses as "Invalid start time" — and an instant otherwise.
 */
export function eventTime(
  at: Date,
  allDay: boolean | undefined,
  zone: { timeZone?: string } = {},
  calendarZone?: string,
) {
  return allDay ? { date: calendarDate(at, calendarZone), dateTime: null } : { dateTime: at.toISOString(), ...zone };
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}
