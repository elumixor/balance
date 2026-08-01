import { View } from "react-native";
import { useTheme } from "../theme";
import { withAlpha } from "../theme/colors";

/**
 * Zero sits in the middle: the bar grows left when a category is short of its
 * target and right when it ran over, so a balanced week reads as a quiet centre
 * line rather than a row of near-full progress bars.
 */
export function DeviationBar({
  ratio,
  color,
  height = 6,
}: {
  /** actual / target. 1 means exactly on plan. */
  ratio: number;
  color: string;
  height?: number;
}) {
  const { colors, radii } = useTheme();
  // ±100% of target maps to the full half-width; beyond that the bar pins.
  const offset = Math.max(-1, Math.min(1, ratio - 1));
  const magnitude = Math.abs(offset) * 50;

  return (
    <View
      style={{
        height,
        borderRadius: radii.sm,
        backgroundColor: colors.surfaceAlt,
        overflow: "hidden",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          position: "absolute",
          left: `${offset < 0 ? 50 - magnitude : 50}%`,
          width: `${magnitude}%`,
          height: "100%",
          backgroundColor: offset < 0 ? withAlpha(color, 0.55) : color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: "50%",
          width: 1,
          height: "100%",
          backgroundColor: colors.lineStrong,
        }}
      />
    </View>
  );
}
