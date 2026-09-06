import { formatDateInput } from "$lib/ui/format";

export const DAYS_PER_WEEK = 7;
export const MINUTES_PER_DAY = 24 * 60;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;

/** Whole local midnights between two instants — rounding is what survives the 23-hour DST day. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

export function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Monday, matching the week the backend's `PeriodResolver` uses for weekly targets. */
export function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  start.setDate(start.getDate() - ((start.getDay() + 6) % DAYS_PER_WEEK));
  return start;
}

export function addDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/** A week's identity: the date of its Monday, "2026-08-03". */
export function weekKey(date: Date): string {
  return formatDateInput(startOfWeek(date));
}

export function weekStartFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * The week as two absolute instants. Local midnight is what the person means by "Monday", and
 * sending it as an instant is what keeps the backend out of time-zone arithmetic entirely.
 */
export function weekRange(key: string): { from: string; to: string } {
  const start = weekStartFromKey(key);
  return { from: start.toISOString(), to: addDays(start, DAYS_PER_WEEK).toISOString() };
}

/** Minutes from that day's local midnight — the week grid's vertical axis. */
export function minutesIntoDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}
