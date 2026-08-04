import Plus from "lucide-react-native/icons/plus";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "../../components/account-menu";
import { ActivityEditor } from "../../components/activities/activity-editor";
import { ActivityRow } from "../../components/activities/activity-row";
import { useActivitiesData } from "../../components/activities/use-activities-data";
import {
  Divider,
  EmptyState,
  GUTTER,
  LoadError,
  Panel,
  Screen,
  ScreenTitle,
  SkeletonRows,
  Text,
  Touchable,
} from "../../components/ui";
import { useTheme } from "../../theme";

export default function ActivitiesScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { activities, categoryById, planned, editing, setEditing, loadError, load, save, archive } =
    useActivitiesData();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: spacing.xxl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenTitle
          title="Activities"
          subtitle={activities ? `${activities.length} active` : undefined}
          trailing={<AccountMenu />}
        />

        {loadError && !activities ? (
          <LoadError message={loadError} onRetry={load} />
        ) : !activities ? (
          <SkeletonRows count={5} />
        ) : (
          <View>
            {activities.length === 0 && editing !== "new" ? (
              <EmptyState
                title="No activities yet."
                hint="An activity is something you do — and how it splits across your week."
              />
            ) : null}

            {activities.map((activity, i) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
                index={i}
                categoryById={categoryById}
                plannedCategories={planned}
                expanded={editing === activity.id}
                onToggle={() => setEditing(editing === activity.id ? null : activity.id)}
                onCancel={() => setEditing(null)}
                onSave={(draft) => save(activity.id, draft)}
                onArchive={() => archive(activity)}
              />
            ))}

            <Divider />
            {editing === "new" ? (
              <Panel style={{ marginTop: spacing.md }}>
                <ActivityEditor
                  activity={null}
                  categories={planned}
                  onCancel={() => setEditing(null)}
                  onSave={(draft) => save("new", draft)}
                />
              </Panel>
            ) : (
              <Touchable
                onPress={() => setEditing("new")}
                scaleTo={1}
                accessibilityRole="button"
                accessibilityLabel="Add activity"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                }}
              >
                <Plus size={16} color={colors.textMuted} />
                <Text role="label" tone="muted">
                  Add activity
                </Text>
              </Touchable>
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
