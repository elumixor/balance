import { SvelteMap } from "svelte/reactivity";
import { Cached } from "./cache.svelte";
import { weekKey, weekRange } from "./dates";
import * as persist from "./persist";
import { getActivities, getCalendarPrefs, getCalendarWeek, getCategories, getIntegrations } from "./queries";
import type { CalendarWeek } from "./types";

/**
 * Every screen's data, held once for the whole app session and once on the device.
 *
 * Both screens read overlapping rows — categories alone back the ring on Planning, the colours
 * on its activity list, and the tint of every block on Calendar. Sharing one cache per thing
 * means a tab tap renders from memory, and a write on any screen lands on all of them.
 *
 * Each cache names a storage key, so a cold start opens on the rows the last session ended with
 * and checks them behind your back — the app is never a spinner waiting on the network.
 */
export const store = {
  categories: new Cached(getCategories, "Couldn't load your categories.", "categories"),
  activities: new Cached(getActivities, "Couldn't load your activities.", "activities"),
  integrations: new Cached(getIntegrations, "Couldn't check your connected calendars.", "integrations"),
  calendars: new Cached(getCalendarPrefs, "Couldn't load your calendars.", "calendars"),
};

/**
 * A week is its own answer, so each one gets a cache — keyed by its Monday. Paging is unbounded,
 * so the map keeps only as many weeks as a month of paging either way could want, dropping
 * whichever arrived first. Reactive, because what's syncing is read off the set as it grows.
 */
const weeks = new SvelteMap<string, Cached<CalendarWeek>>();
/** Comfortably more than the five the grid's strip holds at once, so scrolling a week over and
 *  back doesn't drop the week that was on screen a moment ago. */
const WEEKS_KEPT = 13;
/** A few more than memory holds: paging back to last week shouldn't have to ask the server. */
const WEEKS_STORED = 16;

export function calendarWeek(key: string) {
  let cached = weeks.get(key);
  if (!cached) {
    const { from, to } = weekRange(key);
    cached = new Cached(() => getCalendarWeek(from, to), "Couldn't load that week.", `week:${key}`);
    weeks.set(key, cached);
    persist.prune("week:", WEEKS_STORED);
    while (weeks.size > WEEKS_KEPT) {
      const oldest = weeks.keys().next().value;
      if (oldest === undefined) break;
      weeks.delete(oldest);
    }
  }
  return cached;
}

/**
 * Whether a tab's rows are being checked against the server right now, for the small spinner
 * the tab wears while they are. Only ever true behind rows that are already on screen — see
 * `Cached.syncing` — so it says "this might change", never "there's nothing here yet".
 */
export const syncing = {
  get calendar() {
    return store.integrations.syncing || [...weeks.values()].some((week) => week.syncing);
  },
  get planning() {
    return store.categories.syncing || store.activities.syncing;
  },
};

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
 * here, so the only screen that ever shows a skeleton is one opened before it's ever been seen.
 */
export function warmStore() {
  return Promise.all([
    store.categories.ensure(),
    store.activities.ensure(),
    store.integrations.ensure(),
    calendarWeek(weekKey(new Date())).ensure(),
  ]);
}

/**
 * Points the stored data at whoever just signed in. A different account than the device last
 * held means none of what's on disk — or hydrated from it — is theirs.
 */
export function adoptUser(userId: string) {
  if (persist.adoptOwner(userId)) clearStore();
}

/** Signing out has to take the previous account's rows with it, off screen and off the device. */
export function clearStore() {
  for (const cached of Object.values(store)) cached.clear();
  for (const cached of weeks.values()) cached.clear();
  weeks.clear();
  persist.wipe();
}
