import {
  createManualEntry,
  deleteEntry,
  getActivities,
  getCategories,
  getRunningEntry,
  getTrackData,
  startTimer,
  stopTimer,
  updateEntry,
} from "$lib/queries";
import { activitySplits } from "$lib/splits";
import type { Activity, ActivityRef, Category, Entry, Split } from "$lib/types";

const TRACK_DATA_LIMIT = 20;

export interface EntryDraft {
  activityId: string;
  startedAt: string;
  endedAt: string;
  note: string | null;
}

export interface TrackDay {
  key: string;
  date: Date;
  items: Entry[];
}

export interface StartTile {
  id: string;
  name: string;
  splits: Split[];
}

/** Owns the Track screen's data loading, derived view models, and timer/entry mutations. */
export class TrackData {
  running = $state<Entry | null>(null);
  activities = $state<Activity[]>([]);
  loaded = $state(false);
  refreshing = $state(false);
  startingId = $state<string | null>(null);
  stopping = $state(false);
  editing = $state<string | "new" | null>(null);
  loadError = $state<string | null>(null);
  actionError = $state<string | null>(null);

  #entries = $state<Entry[]>([]);
  #recent = $state<ActivityRef[]>([]);
  #frequent = $state<ActivityRef[]>([]);
  #categories = $state<Category[]>([]);

  #categoryById = $derived(new Map(this.#categories.map((c) => [c.id, c])));
  #activityById = $derived(new Map(this.activities.map((a) => [a.id, a])));

  load = async () => {
    try {
      const [running, trackData, activities, categories] = await Promise.all([
        getRunningEntry(),
        getTrackData(TRACK_DATA_LIMIT),
        getActivities(),
        getCategories(),
      ]);
      this.running = running;
      this.#entries = trackData.entries;
      this.#recent = trackData.recentActivities;
      this.#frequent = trackData.frequentActivities;
      this.activities = activities;
      this.#categories = categories;
      this.loaded = true;
      this.loadError = null;
    } catch (e) {
      this.loadError = e instanceof Error ? e.message : "Couldn't load your entries.";
    }
  };

  splitsFor(activityId: string): Split[] {
    const activity = this.#activityById.get(activityId);
    return activity ? activitySplits(activity, this.#categoryById) : [];
  }

  tiles = $derived.by<StartTile[]>(() => {
    const order = new Map<string, number>();
    [...this.#recent, ...this.#frequent].forEach((a, i) => {
      if (!order.has(a.id)) order.set(a.id, i);
    });
    return [...this.activities]
      .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
      .map((a) => ({ id: a.id, name: a.name, splits: activitySplits(a, this.#categoryById) }));
  });

  days = $derived.by<TrackDay[]>(() => {
    const groups = new Map<string, Entry[]>();
    // The running entry is the card at the top; showing it again as a 0m row lies.
    for (const entry of this.#entries.filter((e) => e.endedAt)) {
      const key = new Date(entry.startedAt).toDateString();
      const bucket = groups.get(key);
      if (bucket) bucket.push(entry);
      else groups.set(key, [entry]);
    }
    return [...groups.entries()].map(([key, items]) => ({ key, date: new Date(key), items }));
  });

  /** Keeps a failed write from disappearing into an unhandled rejection with nothing on screen. */
  async #run(action: () => Promise<unknown>, fallback: string) {
    try {
      this.actionError = null;
      await action();
    } catch (e) {
      this.actionError = e instanceof Error ? e.message : fallback;
    }
  }

  refresh = async () => {
    this.refreshing = true;
    try {
      await this.load();
    } finally {
      this.refreshing = false;
    }
  };

  start = async (activityId: string) => {
    this.startingId = activityId;
    try {
      await this.#run(async () => {
        this.running = await startTimer(activityId);
        await this.load();
      }, "Couldn't start that timer.");
    } finally {
      this.startingId = null;
    }
  };

  stop = async () => {
    this.stopping = true;
    try {
      await this.#run(async () => {
        await stopTimer();
        this.running = null;
        await this.load();
      }, "Couldn't stop the timer.");
    } finally {
      this.stopping = false;
    }
  };

  save = async (entryId: string | "new", draft: EntryDraft) => {
    await this.#run(async () => {
      if (entryId === "new") await createManualEntry(draft);
      else await updateEntry(entryId, draft);
      this.editing = null;
      await this.load();
    }, "Couldn't save that entry.");
  };

  remove = async (entry: Entry) => {
    this.editing = null;
    this.#entries = this.#entries.filter((e) => e.id !== entry.id);
    await this.#run(() => deleteEntry(entry.id), "Couldn't delete that entry.");
    // The row is already gone from the list; this puts it back if the delete didn't land.
    await this.load();
  };
}
