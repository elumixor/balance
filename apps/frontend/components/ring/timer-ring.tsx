import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../../theme";
import type { Split } from "../ui/split-bar";
import { Arc, pointOnRing } from "./arc";

/**
 * While a timer runs, the ring shows where those minutes are going — the running
 * activity's category mix — and a single ink hand sweeps it once an hour, so the
 * card is visibly alive without a spinner.
 */
export function TimerRing({
  splits,
  elapsedMs,
  size = 150,
  thickness = 10,
  children,
}: {
  splits: Split[];
  elapsedMs: number;
  size?: number;
  thickness?: number;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - thickness / 2;

  const total = splits.reduce((sum, s) => sum + s.value, 0);
  const handFraction = (((elapsedMs / 3_600_000) % 1) + 1) % 1;
  const hand = pointOnRing(cx, cy, r, handFraction);

  let cursor = 0;
  const arcs = splits
    .filter((s) => s.value > 0)
    .map((split) => {
      const start = cursor / total;
      cursor += split.value;
      return { split, start, sweep: split.value / total };
    });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={colors.surfaceAlt} strokeWidth={thickness} />
        {arcs.map(({ split, start, sweep }, i) => (
          <Arc
            key={split.id}
            cx={cx}
            cy={cy}
            r={r}
            thickness={thickness}
            color={split.color}
            start={start + 0.004}
            sweep={Math.max(0, sweep - 0.008)}
            delay={i * 45}
          />
        ))}
        <Circle
          cx={hand.x}
          cy={hand.y}
          r={thickness / 2 + 1.5}
          fill={colors.ink}
          stroke={colors.surface}
          strokeWidth={2}
        />
      </Svg>
      <View
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        {children}
      </View>
    </View>
  );
}
