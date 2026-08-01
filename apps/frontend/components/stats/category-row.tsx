import { View } from "react-native";
import { formatHoursAndMinutes } from "../../lib/format";
import type { CategoryStat } from "../../lib/types";
import { useTheme } from "../../theme";
import { DeviationBar } from "../deviation-bar";
import { Dot } from "../ui/split-bar";
import { Text } from "../ui/text";

export function CategoryRow({ stat, color }: { stat: CategoryStat; color: string }) {
  const { spacing } = useTheme();
  const ratio = stat.targetHours > 0 ? stat.actualHours / stat.targetHours : stat.actualHours > 0 ? 2 : 0;
  const drift = stat.diffHours;
  const tone = stat.status === "on-target" ? "positive" : stat.status === "over" ? "caution" : "muted";

  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Dot color={color} size={9} />
        <Text role="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
          {stat.name}
        </Text>
        <Text role="data">{formatHoursAndMinutes(stat.actualHours)}</Text>
        <Text role="dataMicro" tone="faint">
          /{formatHoursAndMinutes(stat.targetHours)}
        </Text>
      </View>

      <DeviationBar ratio={ratio} color={color} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text role="dataMicro" tone={tone}>
          {drift >= 0 ? "+" : "−"}
          {formatHoursAndMinutes(Math.abs(drift))}
          {stat.status === "on-target" ? " on plan" : stat.status === "over" ? " over" : " short"}
        </Text>
        <Text role="micro" tone="faint" numberOfLines={1} style={{ flex: 1, textAlign: "right" }}>
          {stat.breakdown
            .slice(0, 3)
            .map((b) => `${b.activityName} ${formatHoursAndMinutes(b.hours)}`)
            .join("  ·  ")}
        </Text>
      </View>
    </View>
  );
}
