import { useFocusEffect } from "expo-router";
import { Plus } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "../../components/account-menu";
import { EntryEditor, type EntryDraft } from "../../components/track/entry-editor";
import { EntryRow } from "../../components/track/entry-row";
import { QuickStart, type StartTile } from "../../components/track/quick-start";
import { RunningCard } from "../../components/track/running-card";
import {
  Divider,
  EmptyState,
  GUTTER,
  ListItemIn,
  LoadError,
  Panel,
  Screen,
  ScreenTitle,
  SectionHeader,
  SkeletonRows,
  Text,
  Touchable,
} from "../../components/ui";
import { formatDayHeading } from "../../lib/format";
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
import { useTheme } from "../../theme";

export default function TrackScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

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
        getTrackData(20),
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

  const days = useMemo(() => {
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.textMuted}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await load();
              } finally {
                setRefreshing(false);
              }
            }}
          />
        }
      >
        <ScreenTitle title="Track" trailing={<AccountMenu />} />

        {loadError && !loaded ? (
          <LoadError message={loadError} onRetry={load} />
        ) : !loaded ? (
          <SkeletonRows count={5} />
        ) : running ? (
          <RunningCard
            entry={running}
            splits={splitsFor(running.activityId)}
            onStop={onStop}
            stopping={stopping}
          />
        ) : activities.length === 0 ? (
          <Panel>
            <EmptyState
              title="Nothing to track yet"
              hint="Add an activity on the Activities tab, then start it here."
            />
          </Panel>
        ) : (
          <>
            <SectionHeader title="Start" />
            <QuickStart tiles={tiles} onStart={onStart} startingId={startingId} />
          </>
        )}

        {loaded ? (
          <View style={{ marginTop: spacing.xl }}>
            <SectionHeader title="Logged" />

            {days.length === 0 ? (
              <EmptyState title="No entries yet." hint="Start a timer, or add one by hand below." />
            ) : (
              days.map((day) => (
                <View key={day.key} style={{ marginBottom: spacing.md }}>
                  <Text role="micro" tone="faint" style={{ marginBottom: 2 }}>
                    {formatDayHeading(day.date)}
                  </Text>
                  {day.items.map((entry, i) => (
                    <ListItemIn key={entry.id} index={i}>
                      {i > 0 ? <Divider /> : null}
                      <EntryRow
                        entry={entry}
                        splits={splitsFor(entry.activityId)}
                        expanded={editing === entry.id}
                        onToggle={() => setEditing(editing === entry.id ? null : entry.id)}
                        onDelete={() => onDelete(entry)}
                      />
                      {editing === entry.id ? (
                        <Panel style={{ marginBottom: spacing.md }}>
                          <EntryEditor
                            entry={entry}
                            activities={activities}
                            onCancel={() => setEditing(null)}
                            onSave={(draft) => onSave(entry.id, draft)}
                          />
                        </Panel>
                      ) : null}
                    </ListItemIn>
                  ))}
                </View>
              ))
            )}

            {editing === "new" ? (
              <Panel style={{ paddingVertical: 0 }}>
                <EntryEditor
                  entry={null}
                  activities={activities}
                  onCancel={() => setEditing(null)}
                  onSave={(draft) => onSave("new", draft)}
                />
              </Panel>
            ) : (
              <Touchable
                onPress={() => setEditing("new")}
                disabled={activities.length === 0}
                scaleTo={1}
                accessibilityRole="button"
                accessibilityLabel="Add an entry by hand"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  paddingVertical: spacing.md,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                }}
              >
                <Plus size={16} color={colors.textMuted} />
                <Text role="label" tone="muted">
                  Add an entry
                </Text>
              </Touchable>
            )}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
