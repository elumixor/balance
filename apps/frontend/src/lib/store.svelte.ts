import { Cached } from "./cache.svelte";
import { weekKey, weekRange } from "./dates";
import { getActivities, getCalendarPrefs, getCalendarWeek, getCategories, getIntegrations, getStats } from "./queries";
import type { CalendarWeek, StatsResponse } from "./types";

/**
 * Every screen's data, held once for the whole app session.
 *
 * Four screens read overlapping rows — categories alone back the ring on Week, the colours on
 * Activities, the tint of every block on Calendar, and the names on Balance. Sharing one cache
 * per thing means a tab tap renders from memory, and a write on any screen lands on all of them.
 */
export const store = {
  categories: new Cached(getCategories, "Couldn't load your categories."),
  activities: new Cached(getActivities, "Couldn't load your activities."),
  integrations: new Cached(getIntegrations, "Couldn't check your connected calendars."),
  calendars: new Cached(getCalendarPrefs, "Couldn't load your calendars."),
};

export type PeriodKind = "day" | "week" | "month";

/** Stats are three separate answers, so the segmented control gets a cache per period. */
const statsByPeriod = new Map<PeriodKind, Cached<StatsResponse>>();

export function statsFor(period: PeriodKind) {
  let cached = statsByPeriod.get(period);
  if (!cached) {
    cached = new Cached(() => getStats(period), "Couldn't load your balance.");
    statsByPeriod.set(period, cached);
  }
  return cached;
}

/**
 * A week is its own answer too, so each one gets a cache — keyed by its Monday. Unlike the three
 * stats periods these are unbounded, so the map keeps only as many as a month of paging either
 * way could want, dropping whichever arrived first.
 */
const weeks = new Map<string, Cached<CalendarWeek>>();
const WEEKS_KEPT = 9;

export function calendarWeek(key: string) {
  let cached = weeks.get(key);
  if (!cached) {
    const { from, to } = weekRange(key);
    cached = new Cached(() => getCalendarWeek(from, to), "Couldn't load that week.");
    weeks.set(key, cached);
    while (weeks.size > WEEKS_KEPT) {
      const oldest = weeks.keys().next().value;
      if (oldest === undefined) break;
      weeks.delete(oldest);
    }
  }
  return cached;
}

/**
 * What a write changed, and therefore what everything else is now showing stale.
 * `invalidate` rather than `refresh`: the affected screens keep their current rows and refetch
 * when they're next visited, instead of firing four requests nobody is waiting on.
 */
export const invalidate = {
  /** Names, colours and targets feed every screen's labels. */
  categories() {
    store.categories.invalidate();
    invalidateWeeks();
    invalidateStats();
  },
  /** An activity's weights change what every event mapped to it counts toward. */
  activities() {
    store.activities.invalidate();
    invalidateWeeks();
    invalidateStats();
  },
  /** An event moved, or started counting as something else. */
  calendar() {
    invalidateWeeks();
    invalidateStats();
  },
  /** Connecting or disconnecting replaces every event on screen. */
  integrations() {
    store.integrations.invalidate();
    store.calendars.invalidate();
    invalidateWeeks();
    invalidateStats();
  },
};

function invalidateStats() {
  for (const cached of statsByPeriod.values()) cached.invalidate();
}

function invalidateWeeks() {
  for (const cached of weeks.values()) cached.invalidate();
}

/**
 * Fetched once, as soon as there's a session — before any screen asks.
 * The four tabs are one app, not four pages: by the time a tab is tapped its rows are already
 * here, so the only screen that ever shows a skeleton is the one open at startup.
 */
export function warmStore() {
  return Promise.all([
    store.categories.ensure(),
    store.activities.ensure(),
    store.integrations.ensure(),
    calendarWeek(weekKey(new Date())).ensure(),
    statsFor("week").ensure(),
  ]);
}

/** Signing out has to take the previous account's rows with it. */
export function clearStore() {
  for (const cached of Object.values(store)) cached.clear();
  statsByPeriod.clear();
  weeks.clear();
}
