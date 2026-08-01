import { useEffect } from "react";
import { View } from "react-native";
import type { DimensionValue } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useTheme } from "../../theme";

export function Skeleton({
  width = "100%",
  height = 14,
  radius,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const { colors, radii, reduceMotion } = useTheme();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 850 }), -1, true);
  }, [pulse, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius ?? radii.sm, backgroundColor: colors.surfaceAlt },
        style,
      ]}
    />
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ gap: spacing.sm }}>
          <Skeleton width={`${55 + ((i * 13) % 30)}%`} />
          <Skeleton width="35%" height={11} />
        </View>
      ))}
    </View>
  );
}
