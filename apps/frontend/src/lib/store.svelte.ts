import { Cached } from "./cache.svelte";
import { weekKey, weekRange } from "./dates";
import { getActivities, getCalendarPrefs, getCalendarWeek, getCategories, getIntegrations } from "./queries";
import type { CalendarWeek } from "./types";

/**
 * Every screen's data, held once for the whole app session.
 *
 * Both screens read overlapping rows — categories alone back the ring on Planning, the colours
 * on its activity list, and the tint of every block on Calendar. Sharing one cache per thing
 * means a tab tap renders from memory, and a write on any screen lands on all of them.
 */
export const store = {
  categories: new Cached(getCategories, "Couldn't load your categories."),
  activities: new Cached(getActivities, "Couldn't load your activities."),
  integrations: new Cached(getIntegrations, "Couldn't check your connected calendars."),
  calendars: new Cached(getCalendarPrefs, "Couldn't load your calendars."),
};

/**
 * A week is its own answer, so each one gets a cache — keyed by its Monday. Paging is unbounded,
 * so the map keeps only as many weeks as a month of paging either way could want, dropping
 * whichever arrived first.
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
 * when they're next visited, instead of firing a request nobody is waiting on.
 */
export const invalidate = {
  /** Names, colours and targets feed every screen's labels. */
  categories() {
    store.categories.invalidate();
    invalidateWeeks();
  },
  /** An activity's weights change what every event mapped to it counts toward. */
  activities() {
    store.activities.invalidate();
    invalidateWeeks();
  },
  /** An event moved, or started counting as something else. */
  calendar() {
    invalidateWeeks();
  },
  /** Connecting or disconnecting replaces every event on screen. */
  integrations() {
    store.integrations.invalidate();
    store.calendars.invalidate();
    invalidateWeeks();
  },
};

function invalidateWeeks() {
  for (const cached of weeks.values()) cached.invalidate();
}

/**
 * Fetched once, as soon as there's a session — before any screen asks.
 * The two tabs are one app, not two pages: by the time a tab is tapped its rows are already
 * here, so the only screen that ever shows a skeleton is the one open at startup.
 */
export function warmStore() {
  return Promise.all([
    store.categories.ensure(),
    store.activities.ensure(),
    store.integrations.ensure(),
    calendarWeek(weekKey(new Date())).ensure(),
  ]);
}

/** Signing out has to take the previous account's rows with it. */
export function clearStore() {
  for (const cached of Object.values(store)) cached.clear();
  weeks.clear();
}
