import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
} from "../../lib/queries";
import { activitySplits } from "../../lib/splits";
import type { Activity, ActivityRef, Category, Entry } from "../../lib/types";
import type { EntryDraft } from "./entry-editor";
import type { StartTile } from "./quick-start";

const TRACK_DATA_LIMIT = 20;

export interface TrackDay {
  key: string;
  date: Date;
  items: Entry[];
}

/** Owns the Track screen's data loading, derived view models, and timer/entry mutations. */
export function useTrackData() {
  const [running, setRunning] = useState<Entry | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recent, setRecent] = useState<ActivityRef[]>([]);
  const [frequent, setFrequent] = useState<ActivityRef[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [runningEntry, trackData, allActivities, allCategories] = await Promise.all([
        getRunningEntry(),
        getTrackData(TRACK_DATA_LIMIT),
        getActivities(),
        getCategories(),
      ]);
      setRunning(runningEntry);
      setEntries(trackData.entries);
      setRecent(trackData.recentActivities);
      setFrequent(trackData.frequentActivities);
      setActivities(allActivities);
      setCategories(allCategories);
      setLoaded(true);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your entries.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const activityById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);

  const splitsFor = useCallback(
    (activityId: string) => {
      const activity = activityById.get(activityId);
      return activity ? activitySplits(activity, categoryById) : [];
    },
    [activityById, categoryById],
  );

  const tiles = useMemo<StartTile[]>(() => {
    const order = new Map<string, number>();
    [...recent, ...frequent].forEach((a, i) => {
      if (!order.has(a.id)) order.set(a.id, i);
    });
    return [...activities]
      .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
      .map((a) => ({ id: a.id, name: a.name, splits: activitySplits(a, categoryById) }));
  }, [activities, recent, frequent, categoryById]);

  const days = useMemo<TrackDay[]>(() => {
    const groups = new Map<string, Entry[]>();
    // The running entry is the card at the top; showing it again as a 0m row lies.
    for (const entry of entries.filter((e) => e.endedAt)) {
      const key = new Date(entry.startedAt).toDateString();
      const bucket = groups.get(key);
      if (bucket) bucket.push(entry);
      else groups.set(key, [entry]);
    }
    return [...groups.entries()].map(([key, items]) => ({ key, date: new Date(key), items }));
  }, [entries]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function onStart(activityId: string) {
    setStartingId(activityId);
    try {
      setRunning(await startTimer(activityId));
      await load();
    } finally {
      setStartingId(null);
    }
  }

  async function onStop() {
    setStopping(true);
    try {
      await stopTimer();
      setRunning(null);
      await load();
    } finally {
      setStopping(false);
    }
  }

  async function onSave(entryId: string | "new", draft: EntryDraft) {
    if (entryId === "new") await createManualEntry(draft);
    else await updateEntry(entryId, draft);
    setEditing(null);
    await load();
  }

  async function onDelete(entry: Entry) {
    setEditing(null);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    await deleteEntry(entry.id);
    await load();
  }

  return {
    running,
    activities,
    loaded,
    loadError,
    refreshing,
    startingId,
    stopping,
    editing,
    setEditing,
    load,
    refresh,
    splitsFor,
    tiles,
    days,
    onStart,
    onStop,
    onSave,
    onDelete,
  };
}
