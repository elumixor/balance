import { RefreshControl, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "../../components/account-menu";
import { LoggedEntries } from "../../components/track/logged-entries";
import { QuickStart } from "../../components/track/quick-start";
import { RunningCard } from "../../components/track/running-card";
import { useTrackData } from "../../components/track/use-track-data";
import {
  EmptyState,
  GUTTER,
  LoadError,
  Panel,
  Screen,
  ScreenTitle,
  SectionHeader,
  SkeletonRows,
} from "../../components/ui";
import { useTheme } from "../../theme";

export default function TrackScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const {
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
  } = useTrackData();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: spacing.xxl,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.textMuted} onRefresh={refresh} />}
      >
        <ScreenTitle title="Track" trailing={<AccountMenu />} />

        {loadError && !loaded ? (
          <LoadError message={loadError} onRetry={load} />
        ) : !loaded ? (
          <SkeletonRows count={5} />
        ) : running ? (
          <RunningCard entry={running} splits={splitsFor(running.activityId)} onStop={onStop} stopping={stopping} />
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
          <LoggedEntries
            days={days}
            activities={activities}
            editing={editing}
            splitsFor={splitsFor}
            onToggleEdit={(entryId) => setEditing(editing === entryId ? null : entryId)}
            onStartNew={() => setEditing("new")}
            onCancelEdit={() => setEditing(null)}
            onSave={onSave}
            onDelete={onDelete}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
