/**
 * Google gives all-day events a bare `YYYY-MM-DD`, which only means something in the calendar's
 * own time zone. Resolving it there — rather than in the server's zone, which is UTC on Vercel —
 * is what stops an all-day event drifting a day for anyone west of Greenwich.
 */
export function zonedDateToInstant(date: string, timeZone: string): Date {
  const midnightUtc = new Date(`${date}T00:00:00Z`);
  return new Date(midnightUtc.getTime() - offsetMinutes(new Date(`${date}T12:00:00Z`), timeZone) * 60_000);
}

/** How far the zone's wall clock runs ahead of UTC at that instant, in minutes. */
function offsetMinutes(at: Date, timeZone: string): number {
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

  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second"),
  );
  return (wallClock - at.getTime()) / 60_000;
}
