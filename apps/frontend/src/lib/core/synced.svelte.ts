import { model, type Signals, type SyncedStorage, syncedClient } from "@elumixor/synced/client";
import type { SyncResponse } from "@elumixor/synced/protocol";
import type { Person } from "$lib/people/types";
import type { Practice } from "$lib/practices/types";
import { api, callApi } from "./api";
import type { Activity, Category } from "./records";

/**
 * The app's own records — the ones this server owns, as opposed to the calendar's.
 *
 * Every screen that writes used to draw its change, cache it, send it and reconcile the answer by
 * hand. This is that, once: `@elumixor/synced` holds the queue, the retries and the undo, and what
 * a screen sees is always the server's records with its own unacknowledged writes on top.
 */
const models = {
  categories: model<Category>()({}),
  activities: model<Activity>()({}),
  practices: model<Practice>()({}),
  people: model<Person>()({}),
};

/** `$state` in a box, which is the only thing the library wants from Svelte. */
class Cell<T> {
  value = $state() as T;

  constructor(initial: T) {
    this.value = initial;
  }
}

const runes: Signals = { state: <T>(initial: T) => new Cell(initial) };

/**
 * The device's copy is versioned, and the version is bumped when a model's shape changes: records
 * written by an older build are hydrated before anything can check them, so a record from before
 * a field existed would reach the screens without it — and a `.map` on it takes every effect in
 * the app down with it. v5 dropped projects, stages and tasks, which a v4 copy still holds.
 */
const PREFIX = "balance:synced:v5";

/**
 * The device's copy. `localStorage` rather than Capacitor's `Preferences` because it answers
 * synchronously: the records from last session are on screen in the first frame, before the
 * session is even confirmed, which is most of what makes the app feel like it was already open.
 */
const storage: SyncedStorage = {
  readSync: (key) => safely(() => localStorage.getItem(key)) ?? null,
  read: async (key) => safely(() => localStorage.getItem(key)) ?? null,
  write: async (key, value) => void safely(() => localStorage.setItem(key, value)),
  remove: async (key) => void safely(() => localStorage.removeItem(key)),
  keys: async () => ownKeys(),
};

function safely<T>(read: () => T): T | undefined {
  try {
    // Safari throws on access rather than returning null when storage is blocked, and a device
    // with no room for the cache is not a device that should fail to draw.
    return typeof localStorage === "undefined" ? undefined : read();
  } catch {
    return undefined;
  }
}

function ownKeys() {
  return (
    safely(() => {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(PREFIX)) keys.push(key);
      }
      return keys;
    }) ?? []
  );
}

export const synced = syncedClient({
  models,
  prefix: PREFIX,
  storage,
  signals: runes,
  transport: (request) => callApi(api.sync.$post(request) as Promise<SyncResponse>),
  onRejected: (rejected) => {
    lastRejection.value = rejected.reason;
  },
});

/** The one message `NotSignedInError` carries, which the queue only ever has as a string. */
const NOT_SIGNED_IN = "Not authenticated";

/**
 * What the server refused, for the screen that wants to say so. Held rather than thrown: the
 * write was made a while ago and its screen may be long gone, so there is nobody left to catch it.
 */
const lastRejection = new Cell<string | null>(null);

export const syncStatus = {
  get error() {
    const error = lastRejection.value ?? synced.error;
    // A queue that ran before there was a session is not a queue that failed — see
    // `NotSignedInError`. It goes up again as soon as one arrives, with nothing said meanwhile.
    return error === NOT_SIGNED_IN ? null : error;
  },
  /** Only the writes the server refused — a screen showing its own row's failure wants these. */
  get rejected() {
    return lastRejection.value;
  },
  get syncing() {
    return synced.syncing;
  },
  /** Writes the server hasn't acknowledged. Not zero means the device is ahead of the account. */
  get pending() {
    return synced.pendingCount;
  },
  dismiss() {
    lastRejection.value = null;
  },
};

export const categories = synced.models.categories;
export const activities = synced.models.activities;
export const practices = synced.models.practices;
export const people = synced.models.people;

/** What earlier versions of the copy left behind, swept once so it isn't carried forever. */
function forgetOlderVersions() {
  const stale = safely(() => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("balance:synced:") && !key.startsWith(PREFIX)) keys.push(key);
    }
    return keys;
  });
  for (const key of stale ?? []) safely(() => localStorage.removeItem(key));
}

if (typeof window !== "undefined") {
  forgetOlderVersions();
  // Before the first frame, and before there's a session: what the device holds is what the last
  // session ended with, which is what the app should open on.
  void synced.hydrate();

  // A queue that couldn't go up is worth another try the moment there's a network or a screen
  // again — a phone spends most of its time with neither.
  addEventListener("online", () => void synced.sync());
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void synced.sync();
  });
}
