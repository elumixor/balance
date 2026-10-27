import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { practices } from "~/db/schema";
import type { ResolvedEvent } from "~/lib/calendar/events-service";
import { CalendarEventsService } from "~/lib/calendar/events-service";
import { addDays, type Day, startOf } from "~/lib/planning/days";
import { sharedDurations } from "~/lib/stats/overlap";

/** How far back a practice's bars go, and how far it is judged over. */
export const WEEKS_SHOWN = 8;
export const BUDGET_WEEKS = 4;
const MS_PER_HOUR = 3_600_000;

export interface PracticeProgress {
  readonly byWeek: number[];
  /** Kept over the last four whole weeks, as a share of the target. Clamped to one. */
  readonly adherence: number;
}

export interface Progress {
  readonly connected: boolean;
  readonly needsReconnect: boolean;
  /** The Monday of each column, as the user's own day. */
  readonly weeks: Day[];
  readonly practices: Record<string, PracticeProgress>;
}

/**
 * What the calendar says each practice has actually had. Never stored: the calendar is the source
 * of truth, and this is one read of it through the same path every screen uses.
 */
export class PracticeProgressService {
  constructor(
    private readonly userId: string,
    private readonly timeZone: string,
    private readonly today: Day,
  ) {}

  async compute(): Promise<Progress> {
    const practiceRows = await db.query.practices.findMany({
      where: and(eq(practices.userId, this.userId), eq(practices.archived, false)),
    });

    const weeks = this.#weeks();
    const range = await new CalendarEventsService(this.userId).resolve(
      startOf(weeks[0].start, this.timeZone),
      startOf(addDays(this.today, 1), this.timeZone),
    );
    // Only what has happened is evidence: a block booked for tomorrow is a plan, not hours.
    const now = new Date();
    const done = range.events.filter((event) => event.countsTowardHours && event.end <= now);
    // Two blocks at once share the hour, so each week's credits are worked out across everything
    // that counts as something before any one practice takes its part.
    const counted = done.filter((event) => event.weights.length > 0);
    const credit = weeks.map((week) => {
      const shares = sharedDurations(
        counted.map((event) => ({ start: event.start.getTime(), end: event.end.getTime() })),
        { start: week.from.getTime(), end: week.to.getTime() },
      );
      return new Map(counted.map((event, index) => [event, shares[index]]));
    });

    const practicesOut: Record<string, PracticeProgress> = {};
    for (const practice of practiceRows) {
      const events = done.filter((event) => event.mapping?.practiceId === practice.id);
      const byWeek = weeks.map((week, index) =>
        practice.unit === "hours" ? this.#hoursIn(events, credit[index]) : this.#timesIn(events, week),
      );
      // The four whole weeks before this one — a week still being lived can't be judged yet.
      const judged = byWeek.slice(-BUDGET_WEEKS - 1, -1).reduce((sum, count) => sum + count, 0);
      const target = Number(practice.targetPerWeek) * BUDGET_WEEKS;
      practicesOut[practice.id] = { byWeek, adherence: target > 0 ? Math.min(1, judged / target) : 1 };
    }

    return {
      connected: range.connected,
      needsReconnect: range.needsReconnect,
      weeks: weeks.map((week) => week.start),
      practices: practicesOut,
    };
  }

  /** The Mondays of the last `WEEKS_SHOWN` weeks, this one last, each with its instants. */
  #weeks() {
    const weekday = (new Date(`${this.today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const monday = addDays(this.today, -weekday);
    return Array.from({ length: WEEKS_SHOWN }, (_, index) => {
      const start = addDays(monday, (index - WEEKS_SHOWN + 1) * 7);
      return { start, from: startOf(start, this.timeZone), to: startOf(addDays(start, 7), this.timeZone) };
    });
  }

  #hoursIn(events: readonly ResolvedEvent[], credit: ReadonlyMap<ResolvedEvent, number>) {
    const ms = events.reduce((sum, event) => sum + (credit.get(event) ?? 0), 0);
    return Math.round((ms / MS_PER_HOUR) * 100) / 100;
  }

  #timesIn(events: readonly ResolvedEvent[], week: { from: Date; to: Date }) {
    return events.filter((event) => event.start >= week.from && event.start < week.to).length;
  }
}
