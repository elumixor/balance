import { View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../../theme";
import { Text } from "../ui/text";
import { Arc, pointOnRing } from "./arc";
import { useSeamDrag } from "./use-seam-drag";
import { Seam, SplitHandle } from "./week-ring-handles";

export type RingSegment = {
  id: string;
  label: string;
  color: string;
  /** Values share one unit; the ring maps their sum onto 360°. */
  value: number;
};

const GAP_FRACTION = 0.004;
const MIN_SPLIT_FRACTION = 0.055;

/**
 * The week as a dial: one ring holding every hour you have, cut into the slices
 * you mean to spend. Drag a seam to move hours between neighbours, tap ✛ to cut
 * a new slice out of one you already have.
 */
export function WeekRing({
  segments,
  onChange,
  onSplit,
  size = 232,
  thickness = 26,
  unit = "h",
  centerLabel,
  centerValue,
}: {
  segments: RingSegment[];
  onChange: (values: number[]) => void;
  onSplit?: (index: number) => void;
  size?: number;
  thickness?: number;
  unit?: string;
  centerLabel?: string;
  centerValue?: string;
}) {
  const { colors } = useTheme();

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - thickness / 2;

  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  const bounds: number[] = [];
  segments.reduce((sum, s) => {
    const next = sum + s.value;
    bounds.push(next);
    return next;
  }, 0);

  const { containerRef, captureOrigin, dragging, setDragging, moveSeam } = useSeamDrag(
    segments,
    bounds,
    total,
    onChange,
  );
  const focused = dragging !== null ? segments[dragging] : null;

  return (
    <View ref={containerRef} style={{ width: size, height: size }} onLayout={captureOrigin}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={colors.surfaceAlt} strokeWidth={thickness} />
        {segments.map((segment, i) => {
          const start = (bounds[i] - segment.value) / total;
          const sweep = segment.value / total - GAP_FRACTION;
          return (
            <Arc
              key={segment.id}
              cx={cx}
              cy={cy}
              r={r}
              thickness={thickness}
              color={segment.color}
              start={start + GAP_FRACTION / 2}
              sweep={sweep}
              opacity={dragging === null || dragging === i || dragging + 1 === i ? 1 : 0.45}
              animate={dragging === null}
              delay={i * 55}
            />
          );
        })}
      </Svg>

      <View
        style={{
          pointerEvents: "none",
          position: "absolute",
          left: thickness + 8,
          right: thickness + 8,
          top: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <Text role="dataStrong" numberOfLines={1}>
          {focused ? `${round(focused.value)}${unit}` : (centerValue ?? `${round(total)}${unit}`)}
        </Text>
        <Text role="micro" tone="muted" numberOfLines={1} style={{ textAlign: "center" }}>
          {focused ? focused.label || "Untitled" : (centerLabel ?? "planned")}
        </Text>
      </View>

      {onSplit
        ? segments.map((segment, i) => {
            if (segment.value / total < MIN_SPLIT_FRACTION) return null;
            const mid = (bounds[i] - segment.value / 2) / total;
            const pos = pointOnRing(cx, cy, r, mid);
            return (
              <SplitHandle
                key={`split-${segment.id}`}
                x={pos.x}
                y={pos.y}
                onPress={() => onSplit(i)}
                label={`Split ${segment.label || "slice"}`}
              />
            );
          })
        : null}

      {segments.slice(0, -1).map((_, i) => {
        const pos = pointOnRing(cx, cy, r, bounds[i] / total);
        return (
          <Seam
            key={`seam-${i}`}
            x={pos.x}
            y={pos.y}
            angle={bounds[i] / total}
            thickness={thickness}
            active={dragging === i}
            gesture={Gesture.Pan()
              .onBegin(() => setDragging(i))
              .onUpdate((e) => moveSeam(cx, cy, i, e.absoluteX, e.absoluteY))
              .onFinalize(() => setDragging(null))}
          />
        );
      })}
    </View>
  );
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
