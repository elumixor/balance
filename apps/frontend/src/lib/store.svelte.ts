import { Cached } from "./cache.svelte";
import { getActivities, getCategories, getRunningEntry, getStats, getTrackData } from "./queries";
import type { StatsResponse } from "./types";

export const TRACK_DATA_LIMIT = 20;

/**
 * Every screen's data, held once for the whole app session.
 *
 * Four screens read overlapping rows — categories alone back the ring on Week, the colours on
 * Activities, the splits on Track, and the names on Balance. Sharing one cache per thing means
 * a tab tap renders from memory, and a write on any screen lands on all of them at once.
 */
export const store = {
  categories: new Cached(getCategories, "Couldn't load your categories."),
  activities: new Cached(getActivities, "Couldn't load your activities."),
  track: new Cached(() => getTrackData(TRACK_DATA_LIMIT), "Couldn't load your entries."),
  running: new Cached(getRunningEntry, "Couldn't load your timer."),
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
 * What a write changed, and therefore what everything else is now showing stale.
 * `invalidate` rather than `refresh`: the affected screens keep their current rows and refetch
 * when they're next visited, instead of firing four requests nobody is waiting on.
 */
export const invalidate = {
  /** Names, colours and targets feed every screen's labels. */
  categories() {
    store.categories.invalidate();
    invalidateStats();
  },
  /** An activity's weights change what its entries count toward. */
  activities() {
    store.activities.invalidate();
    store.track.invalidate();
    invalidateStats();
  },
  /** Entries move the recent/frequent tiles as well as the totals. */
  entries() {
    store.track.invalidate();
    invalidateStats();
  },
};

function invalidateStats() {
  for (const cached of statsByPeriod.values()) cached.invalidate();
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
    store.track.ensure(),
    store.running.ensure(),
    statsFor("week").ensure(),
  ]);
}

/** Signing out has to take the previous account's rows with it. */
export function clearStore() {
  for (const cached of Object.values(store)) cached.clear();
  statsByPeriod.clear();
}
