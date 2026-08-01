import { useEffect } from "react";
import Animated, { useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Circle } from "react-native-svg";
import { useTheme } from "../../theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const RING_START = -90;

/** Fraction of the circle a value occupies, guarding against an empty total. */
export function fraction(value: number, total: number) {
  return total > 0 ? value / total : 0;
}

export function pointOnRing(cx: number, cy: number, r: number, frac: number) {
  const angle = ((RING_START + frac * 360) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

interface ArcProps {
  cx: number;
  cy: number;
  /** Radius of the arc's centre line. */
  r: number;
  thickness: number;
  color: string;
  /** Both are fractions of the full circle, measured clockwise from 12 o'clock. */
  start: number;
  sweep: number;
  opacity?: number;
  /** Sweeps open on mount; skipped while dragging so the ring tracks the finger. */
  animate?: boolean;
  delay?: number;
  round?: boolean;
}

export function Arc({
  cx,
  cy,
  r,
  thickness,
  color,
  start,
  sweep,
  opacity = 1,
  animate = true,
  delay = 0,
  round = false,
}: ArcProps) {
  const { reduceMotion } = useTheme();
  const shouldAnimate = animate && !reduceMotion;
  const grown = useSharedValue(shouldAnimate ? 0 : 1);
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    if (!shouldAnimate) {
      grown.value = 1;
      return;
    }
    grown.value = withDelay(delay, withTiming(1, { duration: 620 }));
  }, [grown, shouldAnimate, delay]);

  const animatedProps = useAnimatedProps(() => {
    const length = Math.max(0, sweep) * circumference * grown.value;
    return {
      strokeDasharray: [length, circumference - length],
      strokeDashoffset: -start * circumference,
    };
  });

  if (sweep <= 0) return null;

  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={thickness}
      strokeOpacity={opacity}
      strokeLinecap={round ? "round" : "butt"}
      transform={`rotate(-90 ${cx} ${cy})`}
      animatedProps={animatedProps}
    />
  );
}
