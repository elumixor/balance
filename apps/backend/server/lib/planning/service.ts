import { and, eq, gte } from "drizzle-orm";
import { db } from "../../db";
import { categories, type PlannedBlock, plannedDays, plannedWeeks, starLedger } from "../../db/schema";
import { ApiError } from "../api-error";
import { bufferCategoryService } from "../buffer-category";
import { CalendarEventsService, type ResolvedEvent } from "../calendar/events-service";
import { PreferencesService } from "../preferences-service";
import { type SessionCopy, sessionCopyFor } from "./copy";
import { type Block, balanceMatch, budgetFor, COVERAGE_THRESHOLD, coverage, scheduleMatch } from "./coverage";
import { addDays, type Day, dayIn, daysBetween, daysFrom, rangeOf, weekStartOf } from "./days";
import { isFresh, type ScheduledSlot, upcomingSlots } from "./schedule";
import {
  type Award,
  applyDelta,
  balanceBonus,
  dailyAward,
  rankOf,
  STAR_RATES,
  scheduleBonus,
  WEEKLY_STARS,
} from "./stars";

/**
 * The planning ritual: what a session says, what committing one pays, and what a missed day costs.
 *
 * Everything here is settled lazily. There is no cron and no background worker — the ledger is
 * brought up to date whenever a session is asked for, which is the only moment anyone can see it.
 * A phone that was off for a week comes back to the right answer on first open, and an account
 * nobody uses costs nothing to keep correct.
 */

/** As far back as a first open will look for days to charge for. A holiday is not a bankruptcy. */
const MISSED_LOOKBACK_DAYS = 14;
/** The biggest thing that happened, for the review's pills. */
const TOP_BLOCKS = 4;

export type Slot = "evening" | "morning" | "weekly";

export interface SessionBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  categoryId: string | null;
  categoryName: string | null;
  color: string | null;
  icon: string | null;
  hours: number;
}

export interface DayView {
  day: Day;
  planned: boolean;
  rest: boolean;
  /** 0..1 — how much of the day's budget has been given a meaning. */
  coverage: number;
  mappedHours: number;
  budgetHours: number;
  blocks: SessionBlock[];
}

export interface CategoryHours {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  hours: number;
  targetHours: number;
}

export class PlanningService {
  constructor(private readonly userId: string) {}

  /**
   * Everything a session screen and its notification need, in one answer.
   *
   * One round trip on purpose: this is asked for while the app is being opened from a banner, and
   * a screen that assembles itself from four requests is a screen that flashes.
   */
  async summary(options: {
    timeZone: string;
    slot: Slot;
    /** The moment the session is being read *as*, which for a scheduled reminder is when it fires. */
    now?: Date;
    /** False while writing a reminder for a day that has not happened yet — see `copyFor`. */
    persistCopy?: boolean;
    /** False when the caller has already brought the ledger up to date at the real current time. */
    settle?: boolean;
  }) {
    const { timeZone, slot } = options;
    const now = options.now ?? new Date();
    const today = dayIn(timeZone, now);

    // Which day is being planned, and which is being looked back on. The evening plans tomorrow
    // and reviews today; the morning plans today and reviews yesterday.
    const target = slot === "morning" ? today : addDays(today, 1);
    const reviewed = slot === "morning" ? addDays(today, -1) : today;

    if (options.settle !== false) await this.settle({ timeZone, today, threshold: COVERAGE_THRESHOLD });

    const week = weekStartOf(reviewed);
    const from = week < reviewed ? week : reviewed;
    const { events, categories: plan, connected, needsReconnect } = await this.load(from, target, timeZone);

    const [stars, streak, planned, weekPlanned] = await Promise.all([
      this.stars(),
      this.streak(today),
      this.plannedDay(target),
      this.plannedWeek(weekStartOf(addDays(today, 7))),
    ]);

    const budgetHours = budgetFor({ weeklyClaimedHours: claimedHours(plan) });
    const targetView = this.viewOf(target, timeZone, events, plan, budgetHours, planned);
    const reviewView = this.viewOf(reviewed, timeZone, events, plan, budgetHours, null);
    const reviewCategories = categoryHours(events, plan, rangeOf(reviewed, timeZone));
    const reviewHours = reviewCategories.reduce((sum, category) => sum + category.hours, 0);
    const top = [...reviewView.blocks].sort((a, b) => b.hours - a.hours).slice(0, TOP_BLOCKS);

    return {
      slot,
      today,
      timeZone,
      connected,
      needsReconnect,
      rank: rankOf(stars),
      streak,
      rates: STAR_RATES,
      coverageThreshold: COVERAGE_THRESHOLD,
      /** What committing the target day would pay right now, if it isn't already committed. */
      award: planned ? [] : dailyAward({ ahead: daysBetween(today, target) > 0, streak }),
      weeklyAward: weekPlanned ? 0 : WEEKLY_STARS,
      review: { ...reviewView, hours: reviewHours, categories: reviewCategories, top },
      target: targetView,
      week: slot === "weekly" ? this.weekView(reviewed, timeZone, events, plan) : null,
      copy: await sessionCopyFor(
        this.userId,
        reviewed,
        {
          slot,
          timeZone,
          reviewed,
          hours: reviewHours,
          categories: reviewCategories,
          top,
          target,
          targetBlocks: targetView.blocks,
          targetPlanned: !!planned,
          streak,
          stars,
          awardStars: planned
            ? 0
            : dailyAward({ ahead: daysBetween(today, target) > 0, streak }).reduce((sum, a) => sum + a.delta, 0),
        },
        options.persistCopy !== false,
      ),
    };
  }

  /**
   * The reminders to hand the phone, each with the words it will show.
   *
   * Everything the device needs to schedule the next two days in one answer, so the pass it
   * already runs for event reminders can run this one beside it without a second round trip.
   */
  async notifications(options: { timeZone: string; now?: Date }) {
    const now = options.now ?? new Date();
    const preferences = await new PreferencesService(this.userId).get();
    // Once, at the real current time: the loop below reads each slot as if it were already firing,
    // and a settle run at tomorrow evening would charge for a day that has not finished yet.
    await this.settle({
      timeZone: options.timeZone,
      today: dayIn(options.timeZone, now),
      threshold: COVERAGE_THRESHOLD,
    });
    const slots = upcomingSlots({ preferences: preferences.sessions, timeZone: options.timeZone, now });

    const written: (ScheduledSlot & { title: string; body: string })[] = [];
    for (const slot of slots) {
      const copy = await this.copyFor(slot, options.timeZone, now);
      written.push({ ...slot, title: copy.title, body: copy.body });
    }

    return { enabled: preferences.sessions.enabled, slots: written };
  }

  /**
   * The words for a slot that has not arrived yet.
   *
   * Only written for real once the slot is close: an evening's summary composed at breakfast would
   * describe a day that has not happened. Until then the arithmetic version is scheduled, and the
   * next foreground inside the window replaces it.
   */
  private async copyFor(slot: ScheduledSlot, timeZone: string, now: Date): Promise<SessionCopy> {
    const summary = await this.summary({
      timeZone,
      slot: slot.slot,
      now: slot.at,
      persistCopy: isFresh(slot, now),
      settle: false,
    });
    return summary.copy;
  }

  /**
   * A day, committed.
   *
   * The coverage rule is enforced here and not only in the panel: the button being disabled is a
   * courtesy, and the star is the thing that has to be earned. What the day looked like is written
   * down alongside it, because "did it go as planned" has no answer once the calendar moves on.
   */
  async commitDay(options: { day: Day; timeZone: string; rest?: boolean; now?: Date }) {
    const { day, timeZone } = options;
    const now = options.now ?? new Date();
    const today = dayIn(timeZone, now);
    if (daysBetween(today, day) < 0) throw new ApiError("That day is already behind you");

    const existing = await this.plannedDay(day);
    if (existing) return { alreadyPlanned: true, awarded: [] as Award[], stars: await this.stars() };

    const { events, categories: plan } = await this.load(day, day, timeZone);
    const budgetHours = budgetFor({ weeklyClaimedHours: claimedHours(plan) });
    const view = this.viewOf(day, timeZone, events, plan, budgetHours, null);

    const rest = options.rest ?? false;
    if (!rest && view.coverage < COVERAGE_THRESHOLD) {
      throw new ApiError(
        `That day is ${Math.round(view.coverage * 100)}% planned — it needs ${Math.round(COVERAGE_THRESHOLD * 100)}%`,
      );
    }

    const streak = await this.streak(today);
    const awarded = dailyAward({ ahead: daysBetween(today, day) > 0, streak });

    await db.insert(plannedDays).values({
      userId: this.userId,
      day,
      timeZone,
      ahead: daysBetween(today, day) > 0,
      rest,
      coveragePercent: Math.round(view.coverage * 100),
      blocks: rest ? [] : view.blocks.map(toPlannedBlock),
    });

    await this.award(day, awarded);
    return { alreadyPlanned: false, awarded, stars: await this.stars() };
  }

  /** The longer sitting. Pays flat — the week it plans is what earns the rest. */
  async commitWeek(options: { weekStart: Day; timeZone: string }) {
    const weekStart = weekStartOf(options.weekStart);
    const existing = await this.plannedWeek(weekStart);
    if (existing) return { alreadyPlanned: true, awarded: [] as Award[], stars: await this.stars() };

    await db.insert(plannedWeeks).values({ userId: this.userId, weekStart, timeZone: options.timeZone });
    const awarded: Award[] = [{ reason: "weekly", delta: WEEKLY_STARS }];
    await this.award(weekStart, awarded);
    return { alreadyPlanned: false, awarded, stars: await this.stars() };
  }

  /**
   * Brings the ledger up to whatever has happened since it was last looked at: days that ended
   * unplanned, days that ended and can now be told how closely they were kept, and weeks that
   * ended and can be measured against the ring.
   *
   * Idempotent by construction — every row it writes is unique per day and reason, so running it
   * twice in the same minute writes nothing the second time.
   */
  async settle(options: { timeZone: string; today: Day; threshold: number }) {
    const { timeZone, today } = options;
    const yesterday = addDays(today, -1);

    const first = await db.query.plannedDays.findFirst({
      where: eq(plannedDays.userId, this.userId),
      orderBy: (row, { asc }) => [asc(row.day)],
    });
    // Nothing to be behind on until the ritual has been started once.
    if (!first) return;

    const earliest = addDays(today, -MISSED_LOOKBACK_DAYS);
    const from = daysBetween(first.day, earliest) > 0 ? earliest : first.day;
    if (daysBetween(from, yesterday) < 0) return;

    const [rows, ledger] = await Promise.all([
      db.query.plannedDays.findMany({
        where: and(eq(plannedDays.userId, this.userId), gte(plannedDays.day, from)),
      }),
      db.query.starLedger.findMany({
        where: and(eq(starLedger.userId, this.userId), gte(starLedger.day, from)),
      }),
    ]);

    const byDay = new Map(rows.map((row) => [row.day, row]));
    const paid = new Set(ledger.map((row) => `${row.day}:${row.reason}`));
    const pending: { day: Day; awards: Award[] }[] = [];

    for (const day of daysFrom(from, yesterday)) {
      const row = byDay.get(day);
      if (!row) {
        if (!paid.has(`${day}:missed`)) pending.push({ day, awards: [{ reason: "missed", delta: STAR_RATES.missed }] });
        continue;
      }
      if (row.rest || paid.has(`${day}:schedule`) || row.blocks.length === 0) continue;

      const earned = ledger
        .filter((entry) => entry.day === day && entry.delta > 0)
        .reduce((sum, entry) => sum + entry.delta, 0);
      if (earned <= 0) continue;

      const { events } = await this.load(day, day, timeZone);
      const actual = this.blocksOf(day, timeZone, events).map(toBlock);
      const bonus = scheduleBonus({ earned, match: scheduleMatch(row.blocks, actual) });
      if (bonus) pending.push({ day, awards: [bonus] });
    }

    // The week that ended, measured against the ring — but only for a week that was planned.
    const lastWeek = weekStartOf(addDays(weekStartOf(today), -1));
    if (!paid.has(`${lastWeek}:balance`) && daysBetween(from, lastWeek) <= 0) {
      const week = await this.plannedWeek(lastWeek);
      if (week) {
        const earned = ledger
          .filter(
            (entry) =>
              entry.delta > 0 &&
              daysBetween(lastWeek, entry.day) >= 0 &&
              daysBetween(entry.day, addDays(lastWeek, 6)) >= 0,
          )
          .reduce((sum, entry) => sum + entry.delta, 0);
        if (earned > 0) {
          const { events, categories: plan } = await this.load(lastWeek, addDays(lastWeek, 6), timeZone);
          const view = this.weekView(lastWeek, timeZone, events, plan);
          const bonus = balanceBonus({ earned, match: view.match });
          if (bonus) pending.push({ day: lastWeek, awards: [bonus] });
        }
      }
    }

    for (const { day, awards } of pending) await this.award(day, awards);
  }

  /** The running total, floors and all — see `applyDelta`. */
  async stars() {
    const rows = await db
      .select({ day: starLedger.day, delta: starLedger.delta })
      .from(starLedger)
      .where(eq(starLedger.userId, this.userId))
      .orderBy(starLedger.createdAt);

    let total = 0;
    for (const row of rows) total = applyDelta(total, row.delta);
    return total;
  }

  /** Planned days ending yesterday, counting back until one is missing. */
  async streak(today: Day) {
    const from = addDays(today, -60);
    const rows = await db.query.plannedDays.findMany({
      where: and(eq(plannedDays.userId, this.userId), gte(plannedDays.day, from)),
      columns: { day: true },
    });
    const days = new Set(rows.map((row) => row.day));

    let streak = 0;
    for (let day = addDays(today, -1); days.has(day); day = addDays(day, -1)) streak++;
    return streak;
  }

  private async plannedDay(day: Day) {
    return db.query.plannedDays.findFirst({
      where: and(eq(plannedDays.userId, this.userId), eq(plannedDays.day, day)),
    });
  }

  private async plannedWeek(weekStart: Day) {
    return db.query.plannedWeeks.findFirst({
      where: and(eq(plannedWeeks.userId, this.userId), eq(plannedWeeks.weekStart, weekStart)),
    });
  }

  /** Writes what a rule paid, or leaves the row that is already there — see the ledger's index. */
  private async award(day: Day, awards: Award[]) {
    if (awards.length === 0) return;
    await db
      .insert(starLedger)
      .values(awards.map((award) => ({ userId: this.userId, day, delta: award.delta, reason: award.reason })))
      .onConflictDoNothing();
  }

  /** The calendar and the ring over a span of days, which is all any of the views are made of. */
  private async load(from: Day, to: Day, timeZone: string) {
    await bufferCategoryService.sync(this.userId);
    const start = rangeOf(from, timeZone).start;
    const end = rangeOf(to, timeZone).end;

    const [rows, range] = await Promise.all([
      db.query.categories.findMany({
        where: and(eq(categories.userId, this.userId), eq(categories.archived, false)),
      }),
      new CalendarEventsService(this.userId).resolve(start, end),
    ]);

    return {
      connected: range.connected,
      needsReconnect: range.needsReconnect,
      events: range.events,
      categories: rows.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        icon: row.icon,
        targetHoursPerWeek: Number(row.targetHoursPerWeek),
        isBuffer: row.isBuffer,
      })),
    };
  }

  private viewOf(
    day: Day,
    timeZone: string,
    events: readonly ResolvedEvent[],
    plan: readonly PlanCategory[],
    budgetHours: number,
    planned: { rest: boolean } | null | undefined,
  ): DayView {
    const blocks = this.blocksOf(day, timeZone, events, plan);
    const mappedHours = blocks.reduce((sum, block) => (block.categoryId ? sum + block.hours : sum), 0);
    return {
      day,
      planned: !!planned,
      rest: planned?.rest ?? false,
      coverage: coverage({ mappedHours, budgetHours }),
      mappedHours,
      budgetHours,
      blocks,
    };
  }

  /** The day's events, clipped to it, each carrying the category it mostly counts as. */
  private blocksOf(
    day: Day,
    timeZone: string,
    events: readonly ResolvedEvent[],
    plan: readonly PlanCategory[] = [],
  ): SessionBlock[] {
    const { start, end } = rangeOf(day, timeZone);
    const byId = new Map(plan.map((category) => [category.id, category]));

    return events
      .filter((event) => event.countsTowardHours && event.end > start && event.start < end)
      .map((event) => {
        const from = Math.max(event.start.getTime(), start.getTime());
        const to = Math.min(event.end.getTime(), end.getTime());
        // The category an event mostly is. A split block still belongs somewhere on a day view,
        // and "mostly" is the only honest single answer.
        const main = [...event.weights].sort((a, b) => b.weightPercent - a.weightPercent)[0];
        const category = main ? byId.get(main.categoryId) : undefined;
        return {
          id: event.id,
          title: event.title,
          start: new Date(from).toISOString(),
          end: new Date(to).toISOString(),
          categoryId: main?.categoryId ?? null,
          categoryName: category?.name ?? null,
          color: category?.color ?? null,
          icon: category?.icon ?? null,
          hours: (to - from) / 3_600_000,
        };
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  /** The week a review is about: where its hours went, and how closely it followed the ring. */
  private weekView(day: Day, timeZone: string, events: readonly ResolvedEvent[], plan: readonly PlanCategory[]) {
    const weekStart = weekStartOf(day);
    const range = { start: rangeOf(weekStart, timeZone).start, end: rangeOf(addDays(weekStart, 6), timeZone).end };
    const hours = categoryHours(events, plan, range);
    return {
      weekStart,
      categories: hours,
      match: balanceMatch(hours.map((c) => ({ ...c, actualHours: c.hours, isBuffer: false }))),
      hours: hours.reduce((sum, category) => sum + category.hours, 0),
    };
  }
}

interface PlanCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  targetHoursPerWeek: number;
  isBuffer: boolean;
}

/** What the ring claims in a week, buffer excluded — the hours the user means to direct. */
function claimedHours(plan: readonly PlanCategory[]) {
  return plan.reduce((sum, category) => (category.isBuffer ? sum : sum + category.targetHoursPerWeek), 0);
}

/** Hours per category over a range, split the way each event is mapped. */
function categoryHours(
  events: readonly ResolvedEvent[],
  plan: readonly PlanCategory[],
  range: { start: Date; end: Date },
): CategoryHours[] {
  const hours = new Map<string, number>();

  for (const event of events) {
    if (!event.countsTowardHours) continue;
    const from = Math.max(event.start.getTime(), range.start.getTime());
    const to = Math.min(event.end.getTime(), range.end.getTime());
    if (to <= from) continue;
    const span = (to - from) / 3_600_000;
    for (const weight of event.weights) {
      hours.set(weight.categoryId, (hours.get(weight.categoryId) ?? 0) + span * (weight.weightPercent / 100));
    }
  }

  return plan
    .filter((category) => !category.isBuffer)
    .map((category) => ({
      categoryId: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
      hours: hours.get(category.id) ?? 0,
      targetHours: category.targetHoursPerWeek,
    }))
    .sort((a, b) => b.hours - a.hours);
}

function toBlock(block: SessionBlock): Block {
  return { start: Date.parse(block.start), end: Date.parse(block.end), categoryId: block.categoryId };
}

function toPlannedBlock(block: SessionBlock): PlannedBlock {
  return { id: block.id, start: Date.parse(block.start), end: Date.parse(block.end), categoryId: block.categoryId };
}
