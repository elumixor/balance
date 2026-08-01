import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../../theme";
import { withAlpha } from "../../theme/colors";
import { Text } from "../ui/text";
import { Arc } from "./arc";

export type BalanceSlice = {
  id: string;
  label: string;
  color: string;
  targetHours: number;
  actualHours: number;
};

/**
 * Plan on the outside, reality on the inside. Each category keeps a fixed wedge
 * sized by its target, and the inner arc fills that wedge as the hours land —
 * short of the seam means behind, past the seam means the hours were borrowed
 * from whatever comes next.
 */
export function BalanceRing({
  slices,
  size = 236,
  centerValue,
  centerLabel,
}: {
  slices: BalanceSlice[];
  size?: number;
  centerValue: string;
  centerLabel: string;
}) {
  const { colors } = useTheme();
  const planThickness = 9;
  const actualThickness = 17;
  const gap = 5;

  const cx = size / 2;
  const cy = size / 2;
  const rPlan = size / 2 - planThickness / 2;
  const rActual = rPlan - planThickness / 2 - gap - actualThickness / 2;

  const total = slices.reduce((sum, s) => sum + s.targetHours, 0) || 1;

  let cursor = 0;
  const wedges = slices.map((slice) => {
    const start = cursor;
    const width = slice.targetHours / total;
    cursor += width;
    const ratio = slice.targetHours > 0 ? slice.actualHours / slice.targetHours : 0;
    return { slice, start, width, ratio };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={rActual} fill="none" stroke={colors.surfaceAlt} strokeWidth={actualThickness} />

        {wedges.map(({ slice, start, width }, i) => (
          <Arc
            key={`plan-${slice.id}`}
            cx={cx}
            cy={cy}
            r={rPlan}
            thickness={planThickness}
            color={slice.color}
            opacity={0.5}
            start={start + 0.003}
            sweep={Math.max(0, width - 0.006)}
            delay={i * 40}
          />
        ))}

        {wedges.map(({ slice, start, width, ratio }, i) => (
          <Arc
            key={`actual-${slice.id}`}
            cx={cx}
            cy={cy}
            r={rActual}
            thickness={actualThickness}
            color={slice.color}
            start={start + 0.003}
            sweep={Math.max(0, Math.min(ratio, 1) * width - 0.006)}
            delay={220 + i * 40}
          />
        ))}

        {wedges.map(({ slice, start, width, ratio }, i) =>
          ratio > 1.02 ? (
            <Arc
              key={`over-${slice.id}`}
              cx={cx}
              cy={cy}
              r={rActual}
              thickness={actualThickness}
              color={withAlpha(slice.color, 0.45)}
              start={start + width}
              sweep={Math.min(ratio - 1, 0.6) * width}
              delay={420 + i * 40}
            />
          ) : null,
        )}
      </Svg>

      <View
        style={{
          pointerEvents: "none",
          position: "absolute",
          left: 46,
          right: 46,
          top: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
        }}
      >
        <Text role="dataStrong" numberOfLines={1}>
          {centerValue}
        </Text>
        <Text role="micro" tone="muted" numberOfLines={2} style={{ textAlign: "center" }}>
          {centerLabel}
        </Text>
      </View>
    </View>
  );
}
