import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { practices, projects } from "~/db/schema";
import type { ResolvedEvent } from "~/lib/calendar/events-service";
import { CalendarEventsService } from "~/lib/calendar/events-service";
import { addDays, type Day, startOf } from "~/lib/planning/days";
import { sharedDurations } from "~/lib/stats/overlap";

/** How far back a card's bars go, and how far a practice is judged over. */
export const WEEKS_SHOWN = 8;
export const BUDGET_WEEKS = 4;
const MS_PER_HOUR = 3_600_000;

export interface ProjectProgress {
  /** Hours logged in each of the last `WEEKS_SHOWN` weeks, oldest first, this week last. */
  readonly hoursByWeek: number[];
  /** The same, with everything nested under it added in — what a parent's bar shows. */
  readonly rolledUpByWeek: number[];
}

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
  readonly projects: Record<string, ProjectProgress>;
  readonly practices: Record<string, PracticeProgress>;
}

/**
 * What the calendar says each project and practice has actually had — the hours a card compares
 * against its claim. Never stored: the calendar is the source of truth, and this is one read of
 * it through the same path every screen uses.
 *
 * A project holding other projects has two answers, and both are worth having: what was booked
 * against it by name, and what its whole tree came to.
 */
export class ProjectProgressService {
  constructor(
    private readonly userId: string,
    private readonly timeZone: string,
    private readonly today: Day,
  ) {}

  async compute(): Promise<Progress> {
    const [projectRows, practiceRows] = await Promise.all([
      db.query.projects.findMany({ where: and(eq(projects.userId, this.userId), eq(projects.archived, false)) }),
      db.query.practices.findMany({ where: and(eq(practices.userId, this.userId), eq(practices.archived, false)) }),
    ]);

    const weeks = this.#weeks();
    const range = await new CalendarEventsService(this.userId).resolve(
      startOf(weeks[0].start, this.timeZone),
      startOf(addDays(this.today, 1), this.timeZone),
    );
    // Only what has happened is evidence: a block booked for tomorrow is a plan, not hours.
    const now = new Date();
    const done = range.events.filter((event) => event.countsTowardHours && event.end <= now);
    // Two blocks at once share the hour, so each week's credits are worked out across everything
    // that counts as something before any one project takes its part.
    const counted = done.filter((event) => event.weights.length > 0);
    const credit = weeks.map((week) => {
      const shares = sharedDurations(
        counted.map((event) => ({ start: event.start.getTime(), end: event.end.getTime() })),
        { start: week.from.getTime(), end: week.to.getTime() },
      );
      return new Map(counted.map((event, index) => [event, shares[index]]));
    });

    const own = new Map(
      projectRows.map((project) => [
        project.id,
        weeks.map((_, index) =>
          this.#hoursIn(
            done.filter((e) => e.mapping?.projectId === project.id),
            credit[index],
          ),
        ),
      ]),
    );
    const parents = new Map(projectRows.map((project) => [project.id, project.parentId]));

    const projectsOut: Record<string, ProjectProgress> = {};
    for (const project of projectRows) {
      const hoursByWeek = own.get(project.id) ?? [];
      const rolledUpByWeek = hoursByWeek.map((hours, index) =>
        [...own].reduce(
          (total, [id, byWeek]) =>
            id !== project.id && descends(id, project.id, parents) ? total + (byWeek[index] ?? 0) : total,
          hours,
        ),
      );
      projectsOut[project.id] = { hoursByWeek, rolledUpByWeek };
    }

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
      projects: projectsOut,
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

/** Whether `id` is somewhere under `ancestor`, following each row's parent up to the root. */
function descends(id: string, ancestor: string, parents: ReadonlyMap<string, string | null>) {
  let current = parents.get(id) ?? null;
  while (current) {
    if (current === ancestor) return true;
    current = parents.get(current) ?? null;
  }
  return false;
}
