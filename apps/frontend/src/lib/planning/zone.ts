/**
 * The device's own idea of what day it is.
 *
 * A planning day is a day in a place, and the server has no way of knowing which place — so the
 * zone travels with every request and the day is named here.
 */

/** The IANA zone this device is in, or UTC on the rare runtime that won't say. */
export function deviceTimeZone() {
  return orUtc(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/**
 * A zone, or UTC when there isn't one.
 *
 * Its own function because the runtime that returns nothing here is one no test can conjure, and
 * the server rejects an empty zone — so the fallback has to be a thing that can be checked rather
 * than a branch nobody ever takes until the day it matters.
 */
export function orUtc(zone: string | undefined) {
  return zone || "UTC";
}

/** `YYYY-MM-DD` for an instant, in local time — never `toISOString`, which is UTC's answer. */
export function localDay(at: Date = new Date()) {
  const year = at.getFullYear();
  const month = `${at.getMonth() + 1}`.padStart(2, "0");
  const day = `${at.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The day after, as a day rather than as 24 hours — the two differ when the clocks move. */
export function nextDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return localDay(new Date(year, month - 1, date + 1));
}

/**
 * Which sitting it is right now: the evening one from midday on, the morning one before it.
 *
 * Only used when a session is opened by hand rather than from its own reminder, which carries the
 * slot it was scheduled for.
 */
export function slotNow(at: Date = new Date()): "evening" | "morning" {
  return at.getHours() >= 12 ? "evening" : "morning";
}
