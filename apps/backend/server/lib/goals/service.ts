import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "~/db";
import { type GoalMetrics, goalProgress, goals } from "~/db/schema";
import { CategoryService } from "~/lib/categories/service";
import { ApiError, ConflictError, NotFoundError } from "~/lib/http/api-error";
import { dayIn, startOf } from "~/lib/planning/days";
import { type Aggregate, aggregateOf, type Cadence, type Level, periodOf, standingOf } from "./ladder";

type GoalRow = typeof goals.$inferSelect;
type ProgressRow = typeof goalProgress.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_ENTRIES = 50;

export interface GoalInput {
  key: string;
  title: string;
  kind: string;
  metric: string;
  aggregate?: Aggregate;
  cadence?: Cadence;
  timeZone: string;
  levels: Level[];
  advanceAfter?: number;
  easeAfter?: number;
  startsOn?: string;
  sphereId?: string | null;
}

export type GoalPatch = Partial<Omit<GoalInput, "key" | "startsOn">> & { archived?: boolean };

export interface ProgressInput {
  /** The goal's id or its `key`. */
  goal: string;
  externalId: string;
  at: Date;
  metrics: GoalMetrics;
}

/**
 * Goals, the progress apps post toward them, and where each one stands.
 *
 * Only goals and entries are stored. A goal's level, its streak and what it asks for next are
 * worked out on every read from the entries (`ladder.ts`), so an app uploading last week's
 * sittings late changes last week's answer rather than being too late for it.
 */
export class GoalService {
  constructor(private readonly userId: string) {}

  /** Every live goal with where it stands today, unmet ones first. */
  async list(now = new Date()) {
    const rows = await db.query.goals.findMany({
      where: and(eq(goals.userId, this.userId), eq(goals.archived, false)),
      orderBy: asc(goals.createdAt),
    });
    if (rows.length === 0) return [];
    const entries = await db.query.goalProgress.findMany({ where: eq(goalProgress.userId, this.userId) });
    return rows.map((row) =>
      stateOf(
        row,
        entries.filter((entry) => entry.goalId === row.id),
        now,
      ),
    );
  }

  /**
   * The one goal to do next: of those the current period has not met, the one whose period closes
   * soonest, and between two of those the longer streak, since it has more to keep.
   */
  async next(now = new Date()) {
    const open = (await this.list(now))
      .filter((goal) => !goal.period.met)
      .sort((a, b) => a.period.endsAt.localeCompare(b.period.endsAt) || b.streak.current - a.streak.current);
    const next = open[0] ?? null;
    return { next, nudge: next?.nudge ?? "Everything for now is done.", open: open.length };
  }

  async streaks(now = new Date()) {
    return (await this.list(now)).map((goal) => ({
      goalId: goal.id,
      key: goal.key,
      title: goal.title,
      cadence: goal.cadence,
      ...goal.streak,
      lastAt: goal.lastAt,
    }));
  }

  async create(input: GoalInput) {
    checkLevels(input.levels);
    checkZone(input.timeZone);
    await this.checkSphere(input.sphereId);
    const taken = await db.query.goals.findFirst({
      where: and(eq(goals.userId, this.userId), eq(goals.key, input.key)),
    });
    if (taken) throw new ConflictError(`There is already a goal with the key "${input.key}"`);
    const [created] = await db
      .insert(goals)
      .values({
        userId: this.userId,
        key: input.key,
        title: input.title,
        kind: input.kind,
        metric: input.metric,
        aggregate: input.aggregate,
        cadence: input.cadence,
        timeZone: input.timeZone,
        levels: input.levels,
        advanceAfter: input.advanceAfter,
        easeAfter: input.easeAfter,
        startsOn: input.startsOn ?? dayIn(input.timeZone),
        sphereId: input.sphereId ?? null,
      })
      .returning();
    return stateOf(created, [], new Date());
  }

  async update(id: string, patch: GoalPatch) {
    if (patch.levels) checkLevels(patch.levels);
    if (patch.timeZone) checkZone(patch.timeZone);
    await this.checkSphere(patch.sphereId);
    const [updated] = await db
      .update(goals)
      .set(patch)
      .where(and(eq(goals.id, id), eq(goals.userId, this.userId)))
      .returning();
    if (!updated) throw new NotFoundError("No such goal");
    const entries = await db.query.goalProgress.findMany({ where: eq(goalProgress.goalId, id) });
    return stateOf(updated, entries, new Date());
  }

  /** Takes the goal and every entry posted toward it. */
  async remove(id: string) {
    const [deleted] = await db
      .delete(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, this.userId)))
      .returning();
    if (!deleted) throw new NotFoundError("No such goal");
  }

  /**
   * Writes a batch of entries. An entry posted again under the same `source` and `externalId`
   * replaces the one before it; the same id twice in one batch keeps the last.
   */
  async log(source: string, inputs: readonly ProgressInput[]) {
    if (inputs.length === 0) return 0;
    const rows = await db.query.goals.findMany({ where: eq(goals.userId, this.userId) });
    const latest = [...new Map(inputs.map((input) => [input.externalId, input])).values()];
    const values = latest.map((input) => {
      const goal = rows.find((row) => row.id === input.goal || row.key === input.goal);
      if (!goal) throw new ApiError(`Entry ${input.externalId}: no goal "${input.goal}"`);
      return {
        userId: this.userId,
        goalId: goal.id,
        at: input.at,
        metrics: input.metrics,
        source,
        externalId: input.externalId,
      };
    });
    await db
      .insert(goalProgress)
      .values(values)
      .onConflictDoUpdate({
        target: [goalProgress.userId, goalProgress.source, goalProgress.externalId],
        set: {
          goalId: sql`excluded.goal_id`,
          at: sql`excluded.at`,
          metrics: sql`excluded.metrics`,
          updatedAt: new Date(),
        },
      });
    return values.length;
  }

  /** The entries themselves, newest first: what a client draws a history from. */
  async entries(filter: { goal?: string; from?: Date; to?: Date; limit?: number }) {
    const goal = filter.goal ? await this.find(filter.goal) : undefined;
    const rows = await db.query.goalProgress.findMany({
      where: and(
        eq(goalProgress.userId, this.userId),
        goal ? eq(goalProgress.goalId, goal.id) : undefined,
        filter.from ? gte(goalProgress.at, filter.from) : undefined,
        filter.to ? lt(goalProgress.at, filter.to) : undefined,
      ),
      orderBy: desc(goalProgress.at),
      limit: filter.limit ?? DEFAULT_ENTRIES,
    });
    return rows.map((row) => ({
      id: row.id,
      goalId: row.goalId,
      at: row.at.toISOString(),
      metrics: row.metrics,
      source: row.source,
      externalId: row.externalId,
    }));
  }

  private async find(goal: string) {
    const row = await db.query.goals.findFirst({
      where: and(eq(goals.userId, this.userId), UUID.test(goal) ? eq(goals.id, goal) : eq(goals.key, goal)),
    });
    if (!row) throw new NotFoundError(`No goal "${goal}"`);
    return row;
  }

  private async checkSphere(sphereId: string | null | undefined) {
    if (!sphereId) return;
    const spheres = await new CategoryService(this.userId).list();
    if (!spheres.some((sphere) => sphere.id === sphereId)) throw new ApiError(`No sphere ${sphereId}`);
  }
}

function checkLevels(levels: readonly Level[]) {
  const climbs = levels.every((level, index) => index === 0 || level.target > levels[index - 1].target);
  if (!climbs) throw new ApiError("levels: each target must be higher than the one before it");
}

function checkZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new ApiError(`timeZone: "${timeZone}" is not an IANA zone`);
  }
}

export type GoalState = ReturnType<typeof stateOf>;

/** A goal as every client reads it: what was set, where it stands, and what it asks for next. */
function stateOf(row: GoalRow, entries: readonly ProgressRow[], now: Date) {
  const cadence = row.cadence as Cadence;
  const aggregate = row.aggregate as Aggregate;

  const byPeriod = new Map<string, number[]>();
  for (const entry of entries) {
    const value = entry.metrics[row.metric];
    if (aggregate !== "count" && typeof value !== "number") continue;
    const period = periodOf(dayIn(row.timeZone, entry.at), cadence);
    byPeriod.set(period, [...(byPeriod.get(period) ?? []), typeof value === "number" ? value : 0]);
  }
  const totals = new Map([...byPeriod].map(([period, values]) => [period, aggregateOf(values, aggregate)]));

  const standing = standingOf(
    { cadence, levels: row.levels, advanceAfter: row.advanceAfter, easeAfter: row.easeAfter, startsOn: row.startsOn },
    totals,
    dayIn(row.timeZone, now),
  );
  const remaining = Math.max(round(standing.target - standing.value), 0);
  const lastAt = entries.reduce<Date | null>((last, entry) => (!last || entry.at > last ? entry.at : last), null);

  return {
    id: row.id,
    key: row.key,
    title: row.title,
    kind: row.kind,
    metric: row.metric,
    aggregate,
    cadence,
    timeZone: row.timeZone,
    levels: row.levels,
    advanceAfter: row.advanceAfter,
    easeAfter: row.easeAfter,
    startsOn: row.startsOn,
    sphereId: row.sphereId,
    /** The rung in force now, an index into `levels`. */
    level: standing.level,
    target: standing.target,
    label: row.levels[standing.level].label ?? null,
    period: {
      start: standing.periodStart,
      endsAt: startOf(standing.periodEnd, row.timeZone).toISOString(),
      value: round(standing.value),
      remaining,
      met: standing.met,
    },
    streak: {
      current: standing.streak,
      best: standing.bestStreak,
      /** A streak is there to keep and this period has not been met yet. */
      atRisk: !standing.met && standing.streak > 0,
    },
    next: {
      level: standing.nextLevel,
      target: row.levels[standing.nextLevel].target,
      advanceIn: standing.advanceIn,
    },
    nudge: nudgeOf(row, standing, remaining),
    lastAt: lastAt?.toISOString() ?? null,
  };
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The sentence that asks for the next sitting. Arithmetic, never a model: it has to be there
 * whenever an app asks. Written from the far side of the thing, and it never names a miss.
 */
function nudgeOf(row: GoalRow, standing: ReturnType<typeof standingOf>, remaining: number) {
  const weekly = row.cadence === "weekly";
  const unit = weekly ? "week" : "day";
  const amount = (value: number) => (row.aggregate === "count" ? `${value} × ${row.title}` : `${value} ${row.metric}`);
  const run = (count: number) => `${count} ${unit}${count === 1 ? "" : "s"} in a row`;
  const up = row.levels[Math.min(standing.level + 1, row.levels.length - 1)].target;

  if (standing.met) {
    const kept = `Done for ${weekly ? "this week" : "today"}: ${run(standing.streak)}.`;
    if (standing.nextLevel > standing.level)
      return `${kept} ${weekly ? "Next week" : "Tomorrow"} steps up to ${amount(up)}.`;
    return kept;
  }
  const ask = `${amount(remaining)}${standing.value > 0 ? " more" : ""} ${weekly ? "this week" : "today"}`;
  const then = `makes it ${run(standing.streak + 1)}`;
  if (standing.advanceIn === 1) return `${ask} ${then} and steps you up to ${amount(up)}.`;
  return `${ask} ${then}.`;
}
