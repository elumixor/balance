import { ApiError } from "~/lib/http/api-error";
import { rangeOf } from "~/lib/planning/days";

/**
 * A repeat as an assistant says it — which weekdays, and until a day or for a number of times —
 * turned into the RRULE lines a calendar keeps. Pure: everything it needs is passed in.
 */

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface Repeat {
  /** Weekdays it falls on. Left out, the start's own weekday; empty, it doesn't repeat at all. */
  readonly days?: readonly Weekday[];
  /** The last day it may fall on, `YYYY-MM-DD`, inclusive. */
  readonly until?: string;
  /** How many times it happens, the first included. */
  readonly count?: number;
}

export interface RepeatContext {
  readonly allDay: boolean;
  /** The zone `until` is a day in, for a timed event. */
  readonly timeZone: string;
}

/** `20261130T225959Z`: an instant as RRULE writes one. */
function basicUtc(instant: Date): string {
  return `${instant.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

/**
 * The recurrence lines for `repeat`, or an empty list for a one-off — which is also what a calendar
 * is sent to stop a series repeating. `until` is the end of that day where the person is, since
 * RFC 5545 wants it in the same kind as the start: a date for an all-day event, UTC otherwise.
 */
export function ruleOf(repeat: Repeat, context: RepeatContext): string[] {
  if (repeat.days?.length === 0) return [];
  if (repeat.until !== undefined && repeat.count !== undefined) {
    throw new ApiError("A repeat ends on a day or after a count, not both");
  }
  const parts = ["FREQ=WEEKLY"];
  if (repeat.days) {
    const days = new Set(repeat.days);
    parts.push(`BYDAY=${WEEKDAYS.filter((day) => days.has(day)).join(",")}`);
  }
  if (repeat.until !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(repeat.until)) throw new ApiError("until must be a day like 2026-12-31");
    const until = context.allDay
      ? repeat.until.replace(/-/g, "")
      : basicUtc(new Date(rangeOf(repeat.until, context.timeZone).end.getTime() - 1000));
    parts.push(`UNTIL=${until}`);
  }
  if (repeat.count !== undefined) {
    if (!Number.isInteger(repeat.count) || repeat.count < 1) throw new ApiError("count must be a whole number from 1");
    parts.push(`COUNT=${repeat.count}`);
  }
  return [`RRULE:${parts.join(";")}`];
}
