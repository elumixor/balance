import { useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Line } from "react-native-svg";
import { useTheme } from "../../theme";
import { Text } from "../ui/text";
import { Arc, RING_START, pointOnRing } from "./arc";

export type RingSegment = {
  id: string;
  label: string;
  color: string;
  /** Values share one unit; the ring maps their sum onto 360°. */
  value: number;
  /** Locked segments absorb what their neighbour gives up but can't be dragged. */
  locked?: boolean;
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
  const containerRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<number | null>(null);

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

  const focused = dragging !== null ? segments[dragging] : null;

  function fractionFromPoint(absoluteX: number, absoluteY: number) {
    const x = absoluteX - origin.current.x - cx;
    const y = absoluteY - origin.current.y - cy;
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    return ((deg - RING_START + 360) % 360) / 360;
  }

  function moveSeam(index: number, absoluteX: number, absoluteY: number) {
    const raw = fractionFromPoint(absoluteX, absoluteY) * total;
    const reference = bounds[index];
    let value = raw;
    while (value - reference > total / 2) value -= total;
    while (value - reference < -total / 2) value += total;

    const lower = index === 0 ? 0 : bounds[index - 1];
    const upper = bounds[index + 1];
    const clamped = Math.min(Math.max(value, lower), upper);

    const next = segments.map((s) => s.value);
    next[index] = Math.round((clamped - lower) * 10) / 10;
    next[index + 1] = Math.round((upper - clamped) * 10) / 10;
    onChange(next);
  }

  return (
    <View
      ref={containerRef}
      style={{ width: size, height: size }}
      onLayout={() => {
        containerRef.current?.measureInWindow((x, y) => {
          origin.current = { x, y };
        });
      }}
    >
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
              .onUpdate((e) => moveSeam(i, e.absoluteX, e.absoluteY))
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

function Seam({
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

function SplitHandle({ x, y, onPress, label }: { x: number; y: number; onPress: () => void; label: string }) {
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
