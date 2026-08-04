import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "../../theme";
import { Text } from "./text";
import { Touchable } from "./touchable";

export type ButtonVariant = "solid" | "outline" | "quiet" | "danger";
export type ButtonSize = "md" | "sm";

interface Props {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: (color: string, size: number) => ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = "solid", size = "md", disabled, loading, icon, style }: Props) {
  const { colors, spacing, radii } = useTheme();

  const fill = variant === "solid" ? colors.ink : variant === "danger" ? colors.danger : "transparent";
  const fg = variant === "solid" ? colors.inkText : variant === "danger" ? colors.inkText : colors.text;
  const iconSize = size === "sm" ? 15 : 17;

  return (
    <Touchable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          backgroundColor: fill,
          borderRadius: radii.md,
          paddingVertical: size === "sm" ? spacing.sm : spacing.md,
          paddingHorizontal: size === "sm" ? spacing.md : spacing.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
          borderWidth: 1,
          borderColor: variant === "outline" ? colors.lineStrong : "transparent",
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <View>{icon(fg, iconSize)}</View> : null}
      <Text role={size === "sm" ? "label" : "bodyStrong"} color={fg}>
        {label}
      </Text>
    </Touchable>
  );
}

export function IconButton({
  onPress,
  children,
  label,
  tone = "muted",
  style,
}: {
  onPress: () => void;
  children: ReactNode;
  /** Screen-reader name — icon-only controls always need one. */
  label: string;
  tone?: "muted" | "danger" | "plain";
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radii } = useTheme();
  return (
    <Touchable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={0.9}
      style={[
        {
          width: 32,
          height: 32,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radii.md,
          backgroundColor: tone === "plain" ? "transparent" : colors.surfaceAlt,
        },
        style,
      ]}
    >
      {children}
    </Touchable>
  );
}
