export function formatHoursAndMinutes(hours: number): string {
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  // A shortfall of a few seconds rounds away to nothing, and "-0m" then says the opposite of what
  // is true: the sign belongs to a difference, not to a rounding error.
  const sign = hours < 0 && totalMinutes > 0 ? "-" : "";
  if (h <= 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/** "11.5h" — hours to one decimal, trimmed when whole. */
export function formatHoursDecimal(hours: number): string {
  const rounded = Math.round(Math.abs(hours) * 10) / 10;
  const sign = hours < 0 && rounded > 0 ? "-" : "";
  return `${sign}${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}h`;
}

/** Two digits, the way a clock and a date input both want them. */
export const pad2 = (n: number) => n.toString().padStart(2, "0");

/** "14:05" — the format the inline entry editor reads and writes. */
export function formatClock(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "2026-08-01" */
export function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** "Fri Aug 14" — a date as the calendar's popups say it, weekday first and no punctuation. */
export function formatDayDate(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).replace(/,/g, "");
}

export function formatDayHeading(date: Date) {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/** Combines the editor's date + clock fields, or null when either is unusable. */
export function parseDateAndClock(dateInput: string, clockInput: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput.trim());
  const clockMatch = /^(\d{1,2}):(\d{2})$/.exec(clockInput.trim());
  if (!dateMatch || !clockMatch) return null;

  const [, year, month, day] = dateMatch;
  const [, hour, minute] = clockMatch;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  // A date that doesn't exist is rolled into the next month by `Date` rather than refused, so
  // February 31st becomes March 3rd and the event lands a week from where it was typed. The only
  // way to tell is to ask what came back — a date the clocks skipped is still a real instant.
  const rolled =
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    Number(hour) > 23 ||
    Number(minute) > 59;
  return rolled ? null : date;
}
