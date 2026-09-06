import { goto } from "$app/navigation";
import { weekKey } from "$lib/calendar/dates";
import type { CalendarWeek } from "$lib/calendar/types";
import type { Cached } from "$lib/core/cache.svelte";
import { commitPlannedDay, commitPlannedWeek } from "$lib/core/queries";
import { calendarWeek } from "$lib/core/store.svelte";
import { diagnostics } from "$lib/platform/diagnostics.svelte";
import { telemetry } from "$lib/platform/telemetry";
import { progressData } from "./progress.svelte";
import { sessionData } from "./session-data.svelte";
import type { SessionSummary, StarAward } from "./types";
import { deviceTimeZone, localDay } from "./zone";

/**
 * The calendar, in planning mode.
 *
 * Planning is not a screen of its own: it is the week you already know, with one day lit and a bar
 * along the bottom saying how full it is. Everything that makes the calendar good — dragging a
 * block from tomorrow into today, seeing what is either side of the day being planned — is the
 * point, and a purpose-built single-day editor would have thrown all of it away.
 *
 * What the panel needs that the calendar doesn't is the budget, which comes from the session
 * summary that sent the user here. Coverage itself is worked out on the device as blocks move, so
 * the meter answers a drag immediately; the server checks it again when the day is committed,
 * because that is where the star is actually earned.
 */
class PlanMode {
  #day = $state<string | null>(null);
  /**
   * The cache holding the day being planned, resolved when the day is set rather than when the
   * meter is read. Asking the store for a week makes it if it hasn't got one, and making it writes
   * the store's map — a write no `$derived` is allowed to make, and one that used to take every
   * effect in the app down with it the moment the planning bar was drawn.
   */
  #week = $state<Cached<CalendarWeek> | null>(null);

  /** The day being planned, `YYYY-MM-DD`, or null when the calendar is just the calendar. */
  get day() {
    return this.#day;
  }

  set day(value: string | null) {
    this.#day = value;
    this.#week = value ? calendarWeek(weekKey(new Date(dayBounds(value).start))) : null;
  }

  /** Hours the ring gives this day — a seventh of what it claims for the week. */
  budgetHours = $state(0);
  /** How full the day has to be, 0..1. */
  threshold = $state(0.7);
  /** What committing pays, worked out when the session opened. */
  award = $state<StarAward[]>([]);
  /** Set for the Sunday sitting, so finishing also commits the week. */
  weekStart = $state<string | null>(null);
  weeklyAward = $state(0);

  committing = $state(false);
  error = $state<string | null>(null);
  /** What the last commit paid, for the bar to celebrate with before it closes. */
  awarded = $state<StarAward[] | null>(null);

  readonly active = $derived(this.day !== null);

  /** Hours of the day that have been given a category — the only ones that count. */
  readonly mappedHours = $derived.by(() => {
    const day = this.day;
    if (!day) return 0;

    const { start, end } = dayBounds(day);
    const events = this.#week?.value?.events ?? [];

    let hours = 0;
    for (const event of events) {
      if (!event.countsTowardHours || event.weights.length === 0) continue;
      const from = Math.max(Date.parse(event.start), start);
      const to = Math.min(Date.parse(event.end), end);
      if (to > from) hours += (to - from) / 3_600_000;
    }
    return hours;
  });

  readonly coverage = $derived(this.budgetHours > 0 ? Math.min(1, this.mappedHours / this.budgetHours) : 0);
  readonly ready = $derived(this.coverage >= this.threshold);
  readonly remainingHours = $derived(Math.max(0, this.budgetHours * this.threshold - this.mappedHours));
  readonly stars = $derived(this.award.reduce((sum, award) => sum + award.delta, 0) + this.weeklyAward);

  /** Opens the calendar on the day being planned, with the bar along the bottom. */
  start(options: {
    day: string;
    budgetHours: number;
    threshold: number;
    award: StarAward[];
    weekStart?: string | null;
    weeklyAward?: number;
  }) {
    this.day = options.day;
    this.budgetHours = options.budgetHours;
    this.threshold = options.threshold;
    this.award = options.award;
    this.weekStart = options.weekStart ?? null;
    this.weeklyAward = options.weeklyAward ?? 0;
    this.error = null;
    this.awarded = null;
    void goto(`/calendar?plan=${options.day}`);
  }

  /** Planning the day a session is about, with everything the strip needs taken off the summary. */
  startFrom(summary: SessionSummary) {
    this.start({
      day: summary.target.day,
      budgetHours: summary.target.budgetHours,
      threshold: summary.coverageThreshold,
      award: summary.award,
      weekStart: summary.slot === "weekly" && summary.weeklyAward > 0 ? nextWeekStart(summary.today) : null,
      weeklyAward: summary.slot === "weekly" ? summary.weeklyAward : 0,
    });
  }

  stop() {
    this.day = null;
    this.awarded = null;
    this.error = null;
  }

  /** Whether a column is the day being planned. */
  isDay(date: Date) {
    return this.day !== null && localDay(date) === this.day;
  }

  /**
   * Done. The day is written down as it stands, and the week with it when this was the Sunday
   * sitting — one button, because two would leave people wondering which one paid.
   */
  async finish(options: { rest?: boolean } = {}) {
    const day = this.day;
    if (!day || this.committing) return;

    this.committing = true;
    this.error = null;
    try {
      const timeZone = deviceTimeZone();
      const result = await commitPlannedDay({ day, timeZone, rest: options.rest });
      const awarded = [...result.awarded];
      if (this.weekStart) {
        const week = await commitPlannedWeek({ weekStart: this.weekStart, timeZone });
        awarded.push(...week.awarded);
      }
      this.awarded = awarded;
      telemetry.event("plan_committed", {
        day,
        rest: options.rest === true,
        stars: awarded.reduce((s, a) => s + a.delta, 0),
      });
      // The nudge asks whether the day has been planned, and it just has; the badge asks what
      // that paid.
      void sessionData.refresh();
      void progressData.refresh();
    } catch (e) {
      diagnostics.report("Planning", e, { title: "Couldn’t save your plan" });
    } finally {
      this.committing = false;
    }
  }
}

export const planMode = new PlanMode();

/** The Monday after the week being reviewed — the week the Sunday sitting is actually drawing. */
function nextWeekStart(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  const at = new Date(year, month - 1, day);
  const weekday = at.getDay() === 0 ? 7 : at.getDay();
  at.setDate(at.getDate() + (8 - weekday));
  return `${at.getFullYear()}-${`${at.getMonth() + 1}`.padStart(2, "0")}-${`${at.getDate()}`.padStart(2, "0")}`;
}

/** A local day as the two instants it spans, which is what the calendar's events are stamped in. */
function dayBounds(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const start = new Date(year, month - 1, date).getTime();
  const end = new Date(year, month - 1, date + 1).getTime();
  return { start, end };
}
