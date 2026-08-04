import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Line } from "react-native-svg";
import { useTheme } from "../../theme";

/** The draggable divider between two neighbouring ring slices. */
export function Seam({
  x,
  y,
  angle,
  thickness,
  active,
  gesture,
}: {
  x: number;
  y: number;
  angle: number;
  thickness: number;
  active: boolean;
  gesture: ReturnType<typeof Gesture.Pan>;
}) {
  const { colors } = useTheme();
  const hit = 34;
  const barHeight = thickness + 12;
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Move hours between neighbouring slices"
        style={{
          position: "absolute",
          left: x - hit / 2,
          top: y - hit / 2,
          width: hit,
          height: hit,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ rotate: `${angle * 360}deg` }],
        }}
      >
        <View
          style={{
            width: active ? 6 : 4,
            height: barHeight,
            borderRadius: 3,
            backgroundColor: colors.ink,
            borderWidth: 1.5,
            borderColor: colors.surface,
          }}
        />
      </View>
    </GestureDetector>
  );
}

/** The ✛ button that cuts a new slice out of an existing one. */
export function SplitHandle({ x, y, onPress, label }: { x: number; y: number; onPress: () => void; label: string }) {
  const { colors } = useTheme();
  const r = 12;
  const tap = Gesture.Tap().onEnd(() => onPress());
  return (
    <GestureDetector gesture={tap}>
      <View
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2 }}
      >
        <Svg width={r * 2} height={r * 2}>
          <Circle cx={r} cy={r} r={r - 1} fill={colors.surface} stroke={colors.lineStrong} strokeWidth={1} />
          <Line x1={r - 4.5} y1={r} x2={r + 4.5} y2={r} stroke={colors.text} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={r} y1={r - 4.5} x2={r} y2={r + 4.5} stroke={colors.text} strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      </View>
    </GestureDetector>
  );
}
