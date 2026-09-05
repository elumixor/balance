import { untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { Cached } from "./cache.svelte";
import { weekKey, weekRange } from "./dates";
import * as persist from "./persist";
import { deviceTimeZone, localDay } from "./planning/zone";
import {
  getCalendarPrefs,
  getCalendarWeek,
  getIntegrations,
  getPreferences,
  getProjectProgress,
} from "./queries";
import { synced } from "./synced.svelte";
import type { CalendarEvent, CalendarWeek } from "./types";

/**
 * What the app reads but never writes: the calendar's answer to a week, and the state of the
 * connection that produces it.
 *
 * Held once for the whole app session and once on the device, so a tab tap renders from memory
 * and a cold start opens on the rows the last session ended with, checked behind your back.
 * The records this app owns — categories, activities — are not here: they're written as well as
 * read, so they live in `synced.svelte.ts`, where a write is a queue entry rather than a refetch.
 */
export const store = {
  integrations: new Cached(
    getIntegrations,
    "Couldn't check your connected calendars.",
    "integrations",
    "Calendars"
  ),
  calendars: new Cached(
    getCalendarPrefs,
    "Couldn't load your calendars.",
    "calendars",
    "Calendars"
  ),
  preferences: new Cached(
    getPreferences,
    "Couldn't load your settings.",
    "preferences",
    "Settings"
  ),
  /**
   * What the calendar says every project has had — read fresh from the device's own day, since a
   * week is a week where the person is. Its failure is the projects screen's to show.
   */
  progress: new Cached(
    () => getProjectProgress(deviceTimeZone(), localDay()),
    "Couldn't read your projects' hours.",
    "progress"
  ),
};

/**
 * A week is its own answer, so each one gets a cache — keyed by its Monday. Paging is unbounded,
 * so the map keeps only as many weeks as a month of paging either way could want, dropping
 * whichever arrived first. Reactive, because what's syncing is read off the set as it grows.
 */
const weeks = new SvelteMap<string, Cached<CalendarWeek>>();
const WEEKS_KEPT = 9;
/** A few more than memory holds: paging back to last week shouldn't have to ask the server. */
const WEEKS_STORED = 12;

/**
 * The cache for one week, made on the spot the first time anything asks for that Monday.
 *
 * Imperative callers only — never from a `$derived`, an `$effect` or a template expression.
 * Making a week writes the map, and writing a source that the running reaction didn't create is
 * exactly what Svelte refuses inside a derived, so paging onto a week nobody has asked for yet
 * would throw where it should draw. Screens resolve their caches on the way through — the paths
 * that change which week is on show — and let their reactive side read only what that left
 * behind. Reading the map, as `syncing.calendar` does below, is fine from anywhere: it makes
 * nothing, so it has nothing to write.
 */
export function calendarWeek(key: string) {
  // Untracked as well as documented: the note above is the rule, and this is what makes breaking
  // it cost a re-render rather than the whole app — see `agenda.svelte.ts`.
  return untrack(() => resolveWeek(key));
}

function resolveWeek(key: string) {
  const cached = weeks.get(key);
  if (cached) {
    // Asking for a week again makes it the newest, so the map drops the weeks nobody has come back
    // to rather than the ones scrolled over most. Dropping a week that's still on screen costs it
    // its cache: the one made in its place is stale by definition and refetches under the blocks.
    if (weeks.size > 1) {
      weeks.delete(key);
      weeks.set(key, cached);
    }
    return cached;
  }
  const { from, to } = weekRange(key);
  const made = new Cached(
    () => getCalendarWeek(from, to),
    "Couldn't load that week.",
    `week:${key}`
  );
  weeks.set(key, made);
  persist.prune("week:", WEEKS_STORED);
  // Insertion order is least-recently-asked-for first, so the front of the map is what goes.
  for (const oldest of weeks.keys()) {
    if (weeks.size <= WEEKS_KEPT) break;
    weeks.delete(oldest);
  }
  return made;
}

/**
 * Whether a tab's rows are being checked against the server right now, for the small spinner
 * the tab wears while they are. Only ever true behind rows that are already on screen — see
 * `Cached.syncing` — so it says "this might change", never "there's nothing here yet".
 */
export const syncing = {
  get calendar() {
    return (
      store.integrations.syncing ||
      [...weeks.values()].some((week) => week.syncing)
    );
  },
  get planning() {
    return synced.syncing;
  },
  get projects() {
    return synced.syncing || store.progress.syncing;
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
    invalidateWeeks();
  },
  /** An activity's weights change what every event mapped to it counts toward. */
  activities() {
    invalidateWeeks();
  },
  /** An event moved, or started counting as something else — or for something else. */
  calendar() {
    invalidateWeeks();
    store.progress.invalidate();
  },
  /** A stage opened or decided, a manual count added: what the cards say about evidence moved. */
  projects() {
    store.progress.invalidate();
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
    synced.ensure(),
    store.integrations.ensure(),
    store.preferences.ensure(),
    store.progress.ensure(),
    calendarWeek(weekKey(new Date())).ensure(),
  ]);
}

/**
 * Asks the server for everything again, keeping every row on screen while the answers come back.
 * What `r` (⌘R in the native shells) does: a reload would throw away the session and redraw from the device's copy, which is
 * exactly the thing the person pressing it has stopped trusting.
 */
export function refreshStore() {
  return Promise.all([
    synced.sync(),
    ...Object.values(store).map((cached) => cached.refresh()),
    ...[...weeks.values()].map((week) => week.refresh()),
  ]);
}

/**
 * Points the stored data at whoever just signed in. A different account than the device last
 * held means none of what's on disk — or hydrated from it — is theirs.
 */
export function adoptUser(userId: string) {
  if (persist.adoptOwner(userId)) void clearStore();
}

/** Signing out has to take the previous account's rows with it, off screen and off the device. */
export async function clearStore() {
  for (const cached of Object.values(store)) cached.clear();
  for (const cached of weeks.values()) cached.clear();
  weeks.clear();
  persist.wipe();
  await synced.clear();
}

/**
 * What a write to one event did, put straight into the weeks that hold it.
 *
 * The alternative — marking every week stale and asking the server again — costs one request per
 * week on the strip for a change the server has already described in its answer, and asks Google
 * for a range it may still be answering with the version from before the write. The event the
 * write returned is the newest thing anyone has, so it goes in as it is.
 *
 * `previousId` covers the two cases where the answer isn't the row it replaces: a draft becoming
 * the event the calendar made, and an event whose new times put it in a different week.
 */
export function applyCalendarEvent(event: CalendarEvent, previousId?: string) {
  const from = new Date(event.start).getTime();
  const to = new Date(event.end).getTime();
  for (const cached of weeks.values()) {
    const week = cached.value;
    if (!week) continue;
    const kept = week.events.filter(
      (one) => one.id !== event.id && one.id !== previousId
    );
    // The week's own range, not its key: an event that straddles Sunday night belongs to both.
    const overlaps =
      from < new Date(week.to).getTime() && to > new Date(week.from).getTime();
    // A week that neither held this event nor wants it now is left as it was — replacing its
    // array would have the grid re-place every block in it for nothing.
    if (!overlaps && kept.length === week.events.length) continue;
    cached.patch({ ...week, events: overlaps ? [...kept, event] : kept });
  }
}

/** The same for a delete: the row comes out of every week that had it. */
export function dropCalendarEvent(id: string) {
  for (const cached of weeks.values()) {
    const week = cached.value;
    if (!week?.events.some((one) => one.id === id)) continue;
    cached.patch({
      ...week,
      events: week.events.filter((one) => one.id !== id),
    });
  }
}
