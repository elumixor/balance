import { createManualEntry, deleteEntry, startTimer, stopTimer, updateEntry } from "$lib/queries";
import { activitySplits } from "$lib/splits";
import { invalidate, store } from "$lib/store.svelte";
import type { Entry, Split } from "$lib/types";

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

/** Owns the Track screen's view models and timer/entry mutations over the shared store. */
class TrackData {
  startingId = $state<string | null>(null);
  stopping = $state(false);
  editing = $state<string | "new" | null>(null);
  actionError = $state<string | null>(null);

  /** A pending delete the list should already be hiding, before the server has confirmed it. */
  #removed = $state(new Set<string>());

  running = $derived(store.running.value ?? null);
  activities = $derived(store.activities.value ?? []);
  loaded = $derived(store.track.hasValue && store.activities.hasValue && store.categories.hasValue);
  refreshing = $derived(store.track.loading || store.running.loading);
  loadError = $derived(store.track.error ?? store.activities.error ?? store.categories.error ?? store.running.error);

  #entries = $derived((store.track.value?.entries ?? []).filter((e) => !this.#removed.has(e.id)));
  #categoryById = $derived(new Map((store.categories.value ?? []).map((c) => [c.id, c])));
  #activityById = $derived(new Map(this.activities.map((a) => [a.id, a])));

  /** What the screen calls on mount: no request at all once the app already has these rows. */
  enter = () => {
    this.editing = null;
    this.actionError = null;
    return this.load();
  };

  load = () =>
    Promise.all([store.track.ensure(), store.activities.ensure(), store.categories.ensure(), store.running.ensure()]);

  refresh = () =>
    Promise.all([
      store.track.refresh(),
      store.activities.refresh(),
      store.categories.refresh(),
      store.running.refresh(),
    ]);

  splitsFor(activityId: string): Split[] {
    const activity = this.#activityById.get(activityId);
    return activity ? activitySplits(activity, this.#categoryById) : [];
  }

  tiles = $derived.by<StartTile[]>(() => {
    const order = new Map<string, number>();
    const refs = [...(store.track.value?.recentActivities ?? []), ...(store.track.value?.frequentActivities ?? [])];
    refs.forEach((a, i) => {
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

  /** An entry moved: the tiles and every stats period are now out of date. */
  async #entriesChanged() {
    invalidate.entries();
    await store.track.refresh();
  }

  start = async (activityId: string) => {
    this.startingId = activityId;
    try {
      await this.#run(async () => {
        // The response is the running entry, so the card appears without waiting on a reload.
        store.running.set(await startTimer(activityId));
        await this.#entriesChanged();
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
        store.running.set(null);
        await this.#entriesChanged();
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
      await this.#entriesChanged();
    }, "Couldn't save that entry.");
  };

  remove = async (entry: Entry) => {
    this.editing = null;
    this.#removed = new Set(this.#removed).add(entry.id);
    await this.#run(() => deleteEntry(entry.id), "Couldn't delete that entry.");
    await this.#entriesChanged();
    // The refreshed list is the truth now — whether or not the delete landed.
    const removed = new Set(this.#removed);
    removed.delete(entry.id);
    this.#removed = removed;
  };
}

export const trackData = new TrackData();

export type { TrackData };
