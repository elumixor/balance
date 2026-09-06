import { db } from "~/db";
import { plannedDays, plannedWeeks } from "~/db/schema";
import { ApiError } from "~/lib/http/api-error";
import { PreferencesService } from "~/lib/preferences/service";
import { blocksOf, categoryHours, claimedHours, toBlock, toPlannedBlock } from "./blocks";
import { type SessionCopy, sessionCopyFor } from "./copy";
import { budgetFor, COVERAGE_THRESHOLD, scheduleMatch } from "./coverage";
import { addDays, type Day, dayIn, daysBetween, daysFrom, minutesIntoDay, rangeOf, weekStartOf } from "./days";
import { StarLedger } from "./ledger";
import { PlannedDays } from "./planned-days";
import { computeProgress, type Progress } from "./progress";
import { isFresh, type ScheduledSlot, upcomingSlots } from "./schedule";
import {
  type Award,
  balanceBonus,
  dailyAward,
  PLAN_UNTIL_MINUTES,
  rankOf,
  STAR_RATES,
  scheduleBonus,
  WEEKLY_STARS,
} from "./stars";
import type { Slot } from "./types";

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
const DAYS_PER_WEEK = 7;

export class PlanningService {
  readonly #ledger: StarLedger;
  readonly #days: PlannedDays;

  constructor(private readonly userId: string) {
    this.#ledger = new StarLedger(userId);
    this.#days = new PlannedDays(userId);
  }

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

    if (options.settle !== false) await this.settle({ timeZone, today });

    const week = weekStartOf(reviewed);
    const from = week < reviewed ? week : reviewed;
    const { events, categories: plan, connected, needsReconnect } = await this.#days.load(from, target, timeZone);

    const [stars, streak, planned, weekPlanned] = await Promise.all([
      this.#ledger.stars(),
      this.#ledger.streak(today),
      this.#days.day(target),
      this.#days.week(weekStartOf(addDays(today, DAYS_PER_WEEK))),
    ]);

    const budgetHours = budgetFor({ weeklyClaimedHours: claimedHours(plan) });
    const targetView = this.#days.viewOf(target, timeZone, events, plan, budgetHours, planned);
    const reviewView = this.#days.viewOf(reviewed, timeZone, events, plan, budgetHours, null);
    const reviewCategories = categoryHours(events, plan, rangeOf(reviewed, timeZone));
    const reviewHours = reviewCategories.reduce((sum, category) => sum + category.hours, 0);
    const top = [...reviewView.blocks].sort((a, b) => b.hours - a.hours).slice(0, TOP_BLOCKS);
    const award = planned ? [] : this.#awardFor({ today, day: target, timeZone, now, streak });

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
      award,
      weeklyAward: weekPlanned ? 0 : WEEKLY_STARS,
      review: { ...reviewView, hours: reviewHours, categories: reviewCategories, top },
      target: targetView,
      week: slot === "weekly" ? this.#days.weekView(reviewed, timeZone, events, plan) : null,
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
          awardStars: award.reduce((sum, a) => sum + a.delta, 0),
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
    await this.settle({ timeZone: options.timeZone, today: dayIn(options.timeZone, now) });
    const slots = upcomingSlots({ preferences: preferences.sessions, timeZone: options.timeZone, now });

    const written: (ScheduledSlot & { title: string; body: string })[] = [];
    for (const slot of slots) {
      const copy = await this.#copyFor(slot, options.timeZone, now);
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
  async #copyFor(slot: ScheduledSlot, timeZone: string, now: Date): Promise<SessionCopy> {
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
   * The account's record — rank, streaks, payouts, a month of days, achievements — for the stars
   * pane. Settles first for the same reason the summary does: the ledger is only right once the
   * missed days have been charged.
   */
  async progress(options: { timeZone: string; now?: Date }): Promise<Progress> {
    const today = dayIn(options.timeZone, options.now ?? new Date());
    await this.settle({ timeZone: options.timeZone, today });
    const [ledger, days] = await Promise.all([this.#ledger.all(), this.#days.all()]);
    return computeProgress({ today, ledger, days });
  }

  /**
   * A day, committed.
   *
   * The coverage rule is enforced here and not only in the panel: the button being disabled is a
   * courtesy, and the star is the thing that has to be earned. What the day looked like is written
   * down alongside it, because "did it go as planned" has no answer once the calendar moves on.
   *
   * The row's unique key is what decides whether the day was already committed: two devices
   * pressing the button in the same second both get this far, and only the insert that lands
   * pays. The other is told the same thing a later press would be.
   */
  async commitDay(options: { day: Day; timeZone: string; rest?: boolean; now?: Date }) {
    const { day, timeZone } = options;
    const now = options.now ?? new Date();
    const today = dayIn(timeZone, now);
    if (daysBetween(today, day) < 0) throw new ApiError("That day is already behind you");

    const { events, categories: plan } = await this.#days.load(day, day, timeZone);
    const budgetHours = budgetFor({ weeklyClaimedHours: claimedHours(plan) });
    const view = this.#days.viewOf(day, timeZone, events, plan, budgetHours, null);

    const rest = options.rest ?? false;
    if (!rest && view.coverage < COVERAGE_THRESHOLD) {
      throw new ApiError(
        `That day is ${Math.round(view.coverage * 100)}% planned — it needs ${Math.round(COVERAGE_THRESHOLD * 100)}%`,
      );
    }

    const streak = await this.#ledger.streak(today);
    const awarded = this.#awardFor({ today, day, timeZone, now, streak });

    const [inserted] = await db
      .insert(plannedDays)
      .values({
        userId: this.userId,
        day,
        timeZone,
        ahead: daysBetween(today, day) > 0,
        rest,
        coveragePercent: Math.round(view.coverage * 100),
        blocks: rest ? [] : view.blocks.map(toPlannedBlock),
      })
      .onConflictDoNothing({ target: [plannedDays.userId, plannedDays.day] })
      .returning({ id: plannedDays.id });
    if (!inserted) return { alreadyPlanned: true, awarded: [] as Award[], stars: await this.#ledger.stars() };

    await this.#ledger.award(day, awarded);
    return { alreadyPlanned: false, awarded, stars: await this.#ledger.stars() };
  }

  /** What committing `day` pays at `now`: more the evening before, nothing once its morning is gone. */
  #awardFor(options: { today: Day; day: Day; timeZone: string; now: Date; streak: number }) {
    const ahead = daysBetween(options.today, options.day) > 0;
    const late = !ahead && minutesIntoDay(options.timeZone, options.now) >= PLAN_UNTIL_MINUTES;
    return dailyAward({ ahead, streak: options.streak, late });
  }

  /** The longer sitting. Pays flat — the week it plans is what earns the rest. */
  async commitWeek(options: { weekStart: Day; timeZone: string }) {
    const weekStart = weekStartOf(options.weekStart);
    const [inserted] = await db
      .insert(plannedWeeks)
      .values({ userId: this.userId, weekStart, timeZone: options.timeZone })
      .onConflictDoNothing({ target: [plannedWeeks.userId, plannedWeeks.weekStart] })
      .returning({ id: plannedWeeks.id });
    if (!inserted) return { alreadyPlanned: true, awarded: [] as Award[], stars: await this.#ledger.stars() };

    const awarded: Award[] = [{ reason: "weekly", delta: WEEKLY_STARS }];
    await this.#ledger.award(weekStart, awarded);
    return { alreadyPlanned: false, awarded, stars: await this.#ledger.stars() };
  }

  /**
   * Brings the ledger up to whatever has happened since it was last looked at: days that ended
   * unplanned, days that ended and can now be told how closely they were kept, and weeks that
   * ended and can be measured against the ring.
   *
   * Idempotent by construction — every row it writes is unique per day and reason, so running it
   * twice in the same minute writes nothing the second time.
   */
  async settle(options: { timeZone: string; today: Day }) {
    const { timeZone, today } = options;
    const yesterday = addDays(today, -1);

    const first = await this.#days.first();
    if (!first) return;

    const earliest = addDays(today, -MISSED_LOOKBACK_DAYS);
    const from = daysBetween(first.day, earliest) > 0 ? earliest : first.day;
    if (daysBetween(from, yesterday) < 0) return;

    const [rows, ledger] = await Promise.all([this.#days.since(from), this.#ledger.since(from)]);

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

      const { events } = await this.#days.load(day, day, timeZone);
      const actual = blocksOf(events, rangeOf(day, timeZone)).map(toBlock);
      const bonus = scheduleBonus({ earned, match: scheduleMatch(row.blocks, actual) });
      if (bonus) pending.push({ day, awards: [bonus] });
    }

    // The week that ended, measured against the ring — but only for a week that was planned.
    const lastWeek = weekStartOf(addDays(weekStartOf(today), -1));
    if (!paid.has(`${lastWeek}:balance`) && daysBetween(from, lastWeek) <= 0) {
      const week = await this.#days.week(lastWeek);
      if (week) {
        const weekEnd = addDays(lastWeek, DAYS_PER_WEEK - 1);
        const earned = ledger
          .filter(
            (entry) => entry.delta > 0 && daysBetween(lastWeek, entry.day) >= 0 && daysBetween(entry.day, weekEnd) >= 0,
          )
          .reduce((sum, entry) => sum + entry.delta, 0);
        if (earned > 0) {
          const { events, categories: plan } = await this.#days.load(lastWeek, weekEnd, timeZone);
          const view = this.#days.weekView(lastWeek, timeZone, events, plan);
          const bonus = balanceBonus({ earned, match: view.match });
          if (bonus) pending.push({ day: lastWeek, awards: [bonus] });
        }
      }
    }

    for (const { day, awards } of pending) await this.#ledger.award(day, awards);
  }
}
