/**
 * How a series repeats, as the card reads and writes it.
 *
 * The calendar speaks RRULE; the card speaks "weekly on Monday". This is the translation both
 * ways, held to the handful of shapes a person actually sets — every N days, weeks on some days,
 * months on a date, years — plus how it ends. Anything the calendar says that doesn't fit is kept
 * verbatim, so an exotic rule set elsewhere is neither lost nor lied about.
 */

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

/** Never, on a day, or after so many times. */
export type RuleEnd = { kind: "never" } | { kind: "until"; day: string } | { kind: "count"; count: number };

export interface Rule {
  readonly frequency: Frequency;
  readonly interval: number;
  /** 0 is Sunday, the way `Date.getDay` counts. Weekly rules only. */
  readonly weekdays: readonly number[];
  readonly end: RuleEnd;
}

export const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const WORKDAYS = [1, 2, 3, 4, 5] as const;

const FREQUENCY_WORD: Record<Frequency, string> = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };
const FREQUENCY_ADVERB: Record<Frequency, string> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
  yearly: "yearly",
};

export const NEVER: RuleEnd = { kind: "never" };

/** The rules offered at a glance for an event on this day, before "Custom…". */
export function presets(day: Date): { label: string; rule: Rule }[] {
  const weekday = day.getDay();
  return [
    { label: "Daily", rule: { frequency: "daily", interval: 1, weekdays: [], end: NEVER } },
    { label: "Every weekday", rule: { frequency: "weekly", interval: 1, weekdays: [...WORKDAYS], end: NEVER } },
    {
      label: `Weekly on ${WEEKDAY_NAMES[weekday]}`,
      rule: { frequency: "weekly", interval: 1, weekdays: [weekday], end: NEVER },
    },
    { label: `Monthly on the ${ordinal(day.getDate())}`, rule: { frequency: "monthly", interval: 1, weekdays: [], end: NEVER } },
    { label: "Yearly", rule: { frequency: "yearly", interval: 1, weekdays: [], end: NEVER } },
  ];
}

/** One RRULE line, as Google takes it. */
export function toRRule(rule: Rule): string {
  const parts = [`FREQ=${rule.frequency.toUpperCase()}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.frequency === "weekly" && rule.weekdays.length > 0) {
    parts.push(`BYDAY=${[...rule.weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_CODES[d]).join(",")}`);
  }
  if (rule.end.kind === "until") parts.push(`UNTIL=${rule.end.day.replaceAll("-", "")}T235959Z`);
  if (rule.end.kind === "count") parts.push(`COUNT=${rule.end.count}`);
  return `RRULE:${parts.join(";")}`;
}

/**
 * The rule in a series' recurrence lines, or null when there is none — or when what is there is
 * not one this card can draw (a BYMONTHDAY list, an EXDATE-only series), which is left alone.
 */
export function fromRecurrence(lines: readonly string[] | null | undefined): Rule | null {
  const line = lines?.find((l) => l.startsWith("RRULE:"));
  if (!line) return null;
  const fields = new Map(
    line
      .slice("RRULE:".length)
      .split(";")
      .map((part) => part.split("=") as [string, string]),
  );
  const frequency = fields.get("FREQ")?.toLowerCase();
  if (!isFrequency(frequency)) return null;
  const known = new Set(["FREQ", "INTERVAL", "BYDAY", "UNTIL", "COUNT", "WKST"]);
  if ([...fields.keys()].some((key) => !known.has(key))) return null;

  const weekdays = (fields.get("BYDAY") ?? "")
    .split(",")
    .filter(Boolean)
    .map((code) => WEEKDAY_CODES.indexOf(code as (typeof WEEKDAY_CODES)[number]));
  // A weekday with an ordinal ("2MO") is a monthly-on-the-second-Monday rule, not a weekly one.
  if (weekdays.includes(-1) || (weekdays.length > 0 && frequency !== "weekly")) return null;

  const until = fields.get("UNTIL");
  const count = fields.get("COUNT");
  const end: RuleEnd = until
    ? { kind: "until", day: `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` }
    : count
      ? { kind: "count", count: Number(count) }
      : NEVER;
  return { frequency, interval: Number(fields.get("INTERVAL") ?? 1), weekdays, end };
}

/** "Daily", "Every 2 weeks on Mon, Wed", "Every weekday", "Monthly, 10 times". */
export function describe(rule: Rule, day?: Date): string {
  const every =
    rule.interval === 1
      ? capitalize(FREQUENCY_ADVERB[rule.frequency])
      : `Every ${rule.interval} ${FREQUENCY_WORD[rule.frequency]}s`;
  const days =
    rule.frequency === "weekly" && rule.weekdays.length > 0
      ? isWorkweek(rule.weekdays) && rule.interval === 1
        ? "Every weekday"
        : `${every} on ${[...rule.weekdays]
            .sort((a, b) => a - b)
            .map((d) => WEEKDAY_NAMES[d].slice(0, 3))
            .join(", ")}`
      : rule.frequency === "monthly" && day && rule.interval === 1
        ? `Monthly on the ${ordinal(day.getDate())}`
        : every;
  if (rule.end.kind === "until") return `${days} until ${formatDay(rule.end.day)}`;
  if (rule.end.kind === "count") return `${days}, ${rule.end.count} times`;
  return days;
}

function isWorkweek(weekdays: readonly number[]) {
  return weekdays.length === WORKDAYS.length && WORKDAYS.every((d) => weekdays.includes(d));
}

function isFrequency(value: string | undefined): value is Frequency {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "yearly";
}

export function ordinal(n: number) {
  const rest = n % 100;
  const suffix = rest >= 11 && rest <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "2026-03-10" as "Mar 10, 2026" — the day is a date, not an instant, so no zone comes into it. */
function formatDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
