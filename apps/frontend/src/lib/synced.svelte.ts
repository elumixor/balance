import { model, type Signals, type SyncedStorage, syncedClient } from "@elumixor/synced/client";
import type { SyncResponse } from "@elumixor/synced/protocol";
import { api, callApi } from "./api";
import type {
  Activity,
  Category,
  GateEvent,
  Goal,
  Practice,
  Project,
  ProjectComparison,
  Stage,
  StageOutcome,
  Task,
} from "./types";

/**
 * The app's own records — the ones this server owns, as opposed to the calendar's.
 *
 * Every screen that writes used to draw its change, cache it, send it and reconcile the answer by
 * hand. This is that, once: `@elumixor/synced` holds the queue, the retries and the undo, and what
 * a screen sees is always the server's records with its own unacknowledged writes on top.
 */
/** What the client sends when a stage is decided — see `stages.ts` on the server. */
export interface DecidePayload {
  outcome: StageOutcome;
  day: string;
  note: string;
  restart?: {
    name: string;
    sentence: string;
    metric: Stage["metric"];
    threshold: number;
    windowDays: number;
    budgetHours: number;
    hoursPerWeek?: number;
  };
}

const models = {
  categories: model<Category>()({}),
  activities: model<Activity>()({}),
  goals: model<Goal>()({}),
  practices: model<Practice>()({}),
  projects: model<Project>()({}),
  /**
   * The two writes a stage has that are not fields: both belong to the server, which owns the
   * date and the rule that an outcome is chosen once. Neither is undoable — a decision taken back
   * would be a decision, and the app would rather have that said out loud.
   */
  stages: model<Stage>()({
    compare: (a, b) => a.ordinal - b.ordinal,
    actions: {
      decide: {
        optimistic: (_stage, payload: DecidePayload) => ({
          outcome: payload.outcome,
          decidedOn: payload.day,
          decisionNote: payload.note,
        }),
      },
      extend: {
        optimistic: (_stage, payload: { day: string; note: string }) => ({
          extendedOn: payload.day,
          extensionNote: payload.note,
        }),
      },
    },
  }),
  tasks: model<Task>()({ compare: (a, b) => a.ordinal - b.ordinal }),
  gateEvents: model<GateEvent>()({ compare: (a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0) }),
  comparisons: model<ProjectComparison>()({}),
};

/** `$state` in a box, which is the only thing the library wants from Svelte. */
class Cell<T> {
  value = $state() as T;

  constructor(initial: T) {
    this.value = initial;
  }
}

const runes: Signals = { state: <T>(initial: T) => new Cell(initial) };

const PREFIX = "balance:synced:v1";

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

/**
 * What the server refused, for the screen that wants to say so. Held rather than thrown: the
 * write was made a while ago and its screen may be long gone, so there is nobody left to catch it.
 */
const lastRejection = new Cell<string | null>(null);

export const syncStatus = {
  get error() {
    return lastRejection.value ?? synced.error;
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
export const goals = synced.models.goals;
export const practices = synced.models.practices;
export const projects = synced.models.projects;
export const stages = synced.models.stages;
export const tasks = synced.models.tasks;
export const gateEvents = synced.models.gateEvents;
export const comparisons = synced.models.comparisons;

if (typeof window !== "undefined") {
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
