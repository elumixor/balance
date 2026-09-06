/**
 * Days, as the user means them.
 *
 * A planning day is a `YYYY-MM-DD` in a named zone, not an instant: the streak, the missed-day
 * sweep and "is this day still ahead of me" are all questions about the user's calendar day, and a
 * server doing that arithmetic in UTC gets it wrong for anybody east of Greenwich after 5pm.
 *
 * The zone comes from the device, because the device is the only party that knows it.
 */

export type Day = string;

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` for an instant in a zone. `en-CA` is the locale that formats dates that way. */
export function dayIn(timeZone: string, at: Date = new Date()): Day {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * The instant a day begins in its zone.
 *
 * Worked out by guessing UTC midnight and correcting by the offset there, twice — once is wrong
 * for the two days a year when the offset at UTC midnight isn't the offset at local midnight, and
 * a second pass settles it because the correction moves at most an hour.
 */
export function startOf(day: Day, timeZone: string): Date {
  return resolve(Date.parse(`${day}T00:00:00Z`), timeZone);
}

/** The half-open range a day covers, `[start, end)`. A DST day is 23 or 25 hours long. */
export function rangeOf(day: Day, timeZone: string) {
  return { start: startOf(day, timeZone), end: startOf(addDays(day, 1), timeZone) };
}

/** A local wall-clock time on a day, as an instant — `"18:00"` on the day the reminder is for. */
export function timeOn(day: Day, timeZone: string, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return resolve(Date.parse(`${day}T00:00:00Z`) + (hours * 60 + minutes) * 60_000, timeZone);
}

/** How far into its local day an instant is, in minutes — `13:30` in Kyiv is 810 wherever the server sits. */
export function minutesIntoDay(timeZone: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  // `24` is how en-US names midnight with hour12 off.
  return (read("hour") % 24) * 60 + read("minute");
}

/** Days are added as days, not as 24 hours — the length of a day is not a constant. */
export function addDays(day: Day, count: number): Day {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + count);
  return at.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, negative when `to` is behind. */
export function daysBetween(from: Day, to: Day) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Every day from `from` up to and including `to`, or nothing when the range runs backwards. */
export function daysFrom(from: Day, to: Day): Day[] {
  const days: Day[] = [];
  for (let day = from; daysBetween(day, to) >= 0; day = addDays(day, 1)) days.push(day);
  return days;
}

/** 1 for Monday through 7 for Sunday, the way the week is drawn here. */
export function weekdayOf(day: Day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** The Monday of the week a day belongs to. */
export function weekStartOf(day: Day): Day {
  return addDays(day, 1 - weekdayOf(day));
}

/**
 * The instant at which the zone's wall clock reads `wall` — where `wall` is that reading taken as
 * if it were UTC.
 *
 * Two passes: the first corrects by the offset at the wrong instant, which is only wrong on the
 * two days a year the offset moves, and the second settles it because the correction is an hour at
 * most. An hour that does not exist (the spring-forward gap) lands on the instant the clocks moved,
 * which is the only honest answer.
 */
function resolve(wall: number, timeZone: string) {
  let guess = wall;
  for (let i = 0; i < 2; i++) guess = wall - offsetAt(new Date(guess), timeZone);
  return new Date(guess);
}

/** How far a zone is ahead of UTC at an instant, in milliseconds. */
function offsetAt(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  // `24` is how en-US names midnight with hour12 off, and Date.UTC would read it as the next day.
  const hour = read("hour") % 24;
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), hour, read("minute"), read("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}
