import { useFocusEffect } from "expo-router";
import { Archive, Plus } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "../../components/account-menu";
import { ActivityEditor, type ActivityDraft } from "../../components/activities/activity-editor";
import {
  Divider,
  EmptyState,
  GUTTER,
  IconButton,
  ListItemIn,
  LoadError,
  Panel,
  Screen,
  ScreenTitle,
  SkeletonRows,
  SplitBar,
  Tag,
  Text,
  Touchable,
} from "../../components/ui";
import { archiveActivity, createActivity, getActivities, getCategories, updateActivity } from "../../lib/queries";
import { activitySplits } from "../../lib/splits";
import type { Activity, Category } from "../../lib/types";
import { useTheme } from "../../theme";
import { restColor } from "../../theme/colors";

export default function ActivitiesScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextActivities, nextCategories] = await Promise.all([getActivities(), getCategories()]);
      setActivities(nextActivities);
      setCategories(nextCategories);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your activities.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const planned = useMemo(() => categories.filter((c) => !c.isBuffer), [categories]);

  async function save(id: string | "new", draft: ActivityDraft) {
    if (id === "new") await createActivity(draft);
    else await updateActivity(id, draft);
    setEditing(null);
    await load();
  }

  function archive(activity: Activity) {
    Alert.alert("Archive this activity?", `"${activity.name}" disappears from the list. Past entries stay.`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: async () => {
          setEditing(null);
          await archiveActivity(activity.id);
          await load();
        },
      },
    ]);
  }

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

            {activities.map((activity, i) => {
              const expanded = editing === activity.id;
              return (
                <ListItemIn key={activity.id} index={i}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <Touchable
                    onPress={() => setEditing(expanded ? null : activity.id)}
                    scaleTo={1}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`Edit ${activity.name}`}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md }}
                  >
                    <SplitBar
                      splits={activitySplits(activity, categoryById)}
                      vertical
                      height={3}
                      style={{ alignSelf: "stretch", minHeight: 36 }}
                    />
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text role="bodyStrong" numberOfLines={1}>
                        {activity.name}
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                        {activity.weights.length === 0 ? (
                          <Text role="micro" tone="faint">
                            Unassigned
                          </Text>
                        ) : (
                          activity.weights.map((weight) => {
                            const category = categoryById.get(weight.categoryId);
                            return (
                              <Tag
                                key={weight.categoryId}
                                label={`${category?.isBuffer ? "Free time" : (category?.name ?? "Unknown")} ${weight.weightPercent}%`}
                                color={category?.isBuffer ? restColor : (category?.color ?? restColor)}
                              />
                            );
                          })
                        )}
                      </View>
                    </View>
                  </Touchable>
                    {expanded ? (
                      <IconButton label={`Archive ${activity.name}`} onPress={() => archive(activity)}>
                        <Archive size={15} color={colors.textMuted} />
                      </IconButton>
                    ) : null}
                  </View>

                  {expanded ? (
                    <Panel style={{ marginBottom: spacing.md }}>
                      <ActivityEditor
                        activity={activity}
                        categories={planned}
                        onCancel={() => setEditing(null)}
                        onSave={(draft) => save(activity.id, draft)}
                      />
                    </Panel>
                  ) : null}
                </ListItemIn>
              );
            })}

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
