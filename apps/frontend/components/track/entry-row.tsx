import { Trash2 } from "lucide-react-native";
import { View } from "react-native";
import { formatClock, formatHoursAndMinutes } from "../../lib/format";
import type { Entry } from "../../lib/types";
import { useTheme } from "../../theme";
import { IconButton } from "../ui/button";
import { SplitBar, type Split } from "../ui/split-bar";
import { Text } from "../ui/text";
import { Touchable } from "../ui/touchable";

export function EntryRow({
  entry,
  splits,
  expanded,
  onToggle,
  onDelete,
}: {
  entry: Entry;
  splits: Split[];
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { colors, spacing } = useTheme();
  const hours =
    (new Date(entry.endedAt ?? Date.now()).getTime() - new Date(entry.startedAt).getTime()) / 3_600_000;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <Touchable
        onPress={onToggle}
        scaleTo={1}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${entry.activityName}, ${formatHoursAndMinutes(hours)}`}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingVertical: spacing.md,
        }}
      >
        <SplitBar splits={splits} vertical height={3} style={{ alignSelf: "stretch", minHeight: 34 }} />

        <View style={{ flex: 1, gap: 2 }}>
          <Text role="bodyStrong" numberOfLines={1}>
            {entry.activityName}
          </Text>
          <Text role="dataMicro" tone="muted">
            {formatClock(new Date(entry.startedAt))}
            {entry.endedAt ? `–${formatClock(new Date(entry.endedAt))}` : " · running"}
            {entry.note ? `  ${entry.note}` : ""}
          </Text>
        </View>

        <Text role="data" tone={entry.endedAt ? "default" : "muted"}>
          {formatHoursAndMinutes(hours)}
        </Text>
      </Touchable>

      {expanded ? (
        <IconButton label={`Delete ${entry.activityName} entry`} tone="danger" onPress={onDelete}>
          <Trash2 size={15} color={colors.danger} />
        </IconButton>
      ) : null}
    </View>
  );
}
