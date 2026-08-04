import { useCallback } from "react";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../../theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  /** How far the element dips on press. 0 disables the scale. */
  scaleTo?: number;
  dimTo?: number;
}

/** Every tappable surface in the app dips the same amount, so touch feels uniform. */
export function Touchable({ style, scaleTo = 0.97, dimTo = 0.85, disabled, ...rest }: Props) {
  const { reduceMotion } = useTheme();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
    opacity: 1 - pressed.value * (1 - dimTo),
  }));

  const to = useCallback(
    (value: number) => {
      pressed.value = reduceMotion ? value : withTiming(value, { duration: 110 });
    },
    [pressed, reduceMotion],
  );

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        to(1);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(0);
        rest.onPressOut?.(e);
      }}
      style={[style, animatedStyle, disabled ? { opacity: 0.45 } : null]}
    />
  );
}
