import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useTheme } from "../../theme";

export type Split = { id: string; color: string; value: number };

/**
 * The same stacked bar shows an activity's category mix everywhere it appears —
 * in the activity list, on a quick-start tile and as the spine of a logged entry.
 */
export function SplitBar({
  splits,
  height = 4,
  vertical = false,
  style,
}: {
  splits: Split[];
  height?: number;
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radii } = useTheme();
  const total = splits.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    return (
      <View
        style={[
          {
            backgroundColor: colors.line,
            borderRadius: radii.sm,
            ...(vertical ? { width: height, flex: 1 } : { height, width: "100%" }),
          },
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        {
          flexDirection: vertical ? "column" : "row",
          gap: 1.5,
          borderRadius: radii.sm,
          overflow: "hidden",
          ...(vertical ? { width: height } : { height }),
        },
        style,
      ]}
    >
      {splits
        .filter((s) => s.value > 0)
        .map((s) => (
          <View key={s.id} style={{ flexGrow: s.value, flexBasis: 0, backgroundColor: s.color }} />
        ))}
    </View>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}
