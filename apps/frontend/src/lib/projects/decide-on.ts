/**
 * The client's copy of the server's date rule, so a stage being typed can say where it will land
 * before it exists. The server derives the real date on its own when the stage starts, and that
 * one is the record — this is only the preview under the field.
 */

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
const MIN_STAGE_DAYS = 7;
export const EXTENSION_DAYS = 14;
export const CHECKPOINT_DAYS = 14;

/** `YYYY-MM-DD` plus whole days, in UTC arithmetic — a day key has no zone to get wrong. */
export function addDaysKey(day: string, count: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + count);
  return at.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, negative when `to` is behind. */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function decideOnFor(input: {
  startedOn: string;
  budgetHours: number;
  hoursPerWeek: number;
  windowDays: number;
  deadline?: string | null;
}): string {
  if (input.deadline) return input.deadline;
  const weeks = input.hoursPerWeek > 0 ? input.budgetHours / input.hoursPerWeek : 0;
  const byBudget = Math.ceil(weeks * DAYS_PER_WEEK);
  return addDaysKey(input.startedOn, Math.max(byBudget, input.windowDays, MIN_STAGE_DAYS));
}

/** Every fortnight from the start up to, but not on, the decision day. */
export function checkpointsBetween(startedOn: string, decideOn: string): string[] {
  const days: string[] = [];
  for (let at = addDaysKey(startedOn, CHECKPOINT_DAYS); daysBetweenKeys(at, decideOn) > 0; at = addDaysKey(at, CHECKPOINT_DAYS)) {
    days.push(at);
  }
  return days;
}

/** The checkpoint owed right now: the latest that has come round, unless it was looked at. */
export function dueCheckpoint(input: { startedOn: string; decideOn: string; today: string; looked: readonly string[] }) {
  const latest = checkpointsBetween(input.startedOn, input.decideOn)
    .filter((day) => daysBetweenKeys(day, input.today) >= 0)
    .at(-1);
  return latest && !input.looked.includes(latest) ? latest : null;
}

/** "Oct 6" for a day key, in no zone at all — the key is already the user's day. */
export function formatDayKey(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
