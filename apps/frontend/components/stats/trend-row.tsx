import { View } from "react-native";
import type { CategoryTrend } from "../../lib/types";
import { useTheme } from "../../theme";
import { withAlpha } from "../../theme/colors";
import { Dot } from "../ui/split-bar";
import { Text } from "../ui/text";

/**
 * One bar per past period, the latest at full strength. The dashed line is the
 * target, so a run of bars sitting under it reads as a habit, not an off week.
 */
export function TrendRow({ trend, color }: { trend: CategoryTrend; color: string }) {
  const { colors, spacing } = useTheme();
  const last = trend.points.length - 1;

  return (
    <View style={{ gap: spacing.xs, paddingVertical: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Dot color={color} size={7} />
        <Text role="micro" tone="muted">
          {trend.name}
        </Text>
      </View>

      <View style={{ height: 38, justifyContent: "flex-end" }}>
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "50%",
            height: 1,
            backgroundColor: colors.line,
          }}
        />
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: "100%" }}>
          {trend.points.map((point, i) => {
            const ratio =
              point.targetHours > 0 ? point.actualHours / point.targetHours : point.actualHours > 0 ? 2 : 0;
            // The target line sits at half height, so a period on plan reaches it exactly.
            const height = Math.min(100, Math.max(3, ratio * 50));
            return (
              <View
                key={point.periodStart}
                style={{
                  flex: 1,
                  height: `${height}%`,
                  borderRadius: 2,
                  backgroundColor: i === last ? color : withAlpha(color, 0.35),
                }}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}
