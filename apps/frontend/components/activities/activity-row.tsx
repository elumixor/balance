import Archive from "lucide-react-native/icons/archive";
import { View } from "react-native";
import { activitySplits } from "../../lib/splits";
import type { Activity, Category } from "../../lib/types";
import { useTheme } from "../../theme";
import { restColor } from "../../theme/colors";
import { Divider, IconButton, ListItemIn, Panel, SplitBar, Tag, Text, Touchable } from "../ui";
import { type ActivityDraft, ActivityEditor } from "./activity-editor";

interface Props {
  activity: Activity;
  index: number;
  categoryById: Map<string, Category>;
  plannedCategories: Category[];
  expanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
  onSave: (draft: ActivityDraft) => Promise<void>;
  onArchive: () => void;
}

/** One row in the Activities list: summary + split bar, expanding into the full editor. */
export function ActivityRow({
  activity,
  index,
  categoryById,
  plannedCategories,
  expanded,
  onToggle,
  onCancel,
  onSave,
  onArchive,
}: Props) {
  const { colors, spacing } = useTheme();

  return (
    <ListItemIn index={index}>
      {index > 0 ? <Divider /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Touchable
          onPress={onToggle}
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
          <IconButton label={`Archive ${activity.name}`} onPress={onArchive}>
            <Archive size={15} color={colors.textMuted} />
          </IconButton>
        ) : null}
      </View>

      {expanded ? (
        <Panel style={{ marginBottom: spacing.md }}>
          <ActivityEditor activity={activity} categories={plannedCategories} onCancel={onCancel} onSave={onSave} />
        </Panel>
      ) : null}
    </ListItemIn>
  );
}
