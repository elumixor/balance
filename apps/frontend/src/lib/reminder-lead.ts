/**
 * How long before an event a reminder fires, as it is typed and as it is read back.
 *
 * "5m", "1h", "2 days", "at time", "30 minutes before" all mean one number of minutes, and one
 * number of minutes reads back as the shortest of those that says it. Kept apart from
 * `reminders.ts`, which answers *when* a reminder is due; this only answers what the words mean.
 */

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/** The leads a reminder is offered at before anything is typed. */
export const LEAD_PRESETS = [0, 5, 10, 15, 30, 60, 120, MINUTES_PER_DAY] as const;

const UNITS: { pattern: RegExp; minutes: number }[] = [
  { pattern: /^(m|min|mins|minute|minutes)$/, minutes: 1 },
  { pattern: /^(h|hr|hrs|hour|hours)$/, minutes: MINUTES_PER_HOUR },
  { pattern: /^(d|day|days)$/, minutes: MINUTES_PER_DAY },
  { pattern: /^(w|wk|week|weeks)$/, minutes: MINUTES_PER_WEEK },
];

/** The minutes a phrase means, or null when it isn't one. A bare number is minutes. */
export function parseLead(text: string): number | null {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/\s*(before|before it starts|before start|early)$/, "");
  if (/^(at time|at start|on time|when it starts|0)$/.test(cleaned)) return 0;
  // "1h 30m" is two amounts added; each is a number and, after the first, a unit.
  const pieces = [...cleaned.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]*)/g)];
  const covered = pieces.map((piece) => piece[0]).join("");
  if (pieces.length === 0 || covered.replaceAll(/\s+/g, "") !== cleaned.replaceAll(/\s+/g, "")) return null;
  let minutes = 0;
  for (const [index, [, amount, word]] of pieces.entries()) {
    const unit = word ? UNITS.find((u) => u.pattern.test(word)) : index === 0 ? UNITS[0] : undefined;
    if (!unit) return null;
    minutes += Math.round(Number(amount) * unit.minutes);
  }
  return minutes <= 4 * MINUTES_PER_WEEK ? minutes : null;
}

/** "5m", "1h", "1h 30m", "2d", "at time". */
export function formatLead(minutes: number): string {
  if (minutes <= 0) return "at time";
  if (minutes % MINUTES_PER_WEEK === 0) return `${minutes / MINUTES_PER_WEEK}w`;
  if (minutes % MINUTES_PER_DAY === 0) return `${minutes / MINUTES_PER_DAY}d`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** The long form for a list: "5 minutes before", "1 hour before", "at time". */
export function describeLead(minutes: number): string {
  if (minutes <= 0) return "At time";
  const say = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (minutes % MINUTES_PER_WEEK === 0) return `${say(minutes / MINUTES_PER_WEEK, "week")} before`;
  if (minutes % MINUTES_PER_DAY === 0) return `${say(minutes / MINUTES_PER_DAY, "day")} before`;
  if (minutes % MINUTES_PER_HOUR === 0) return `${say(minutes / MINUTES_PER_HOUR, "hour")} before`;
  return `${say(minutes, "minute")} before`;
}
