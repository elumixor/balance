import type { ReactNode } from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "../../theme";
import { Text } from "./text";

/** Every screen shares one gutter so titles, rules and rows line up across tabs. */
export const GUTTER = 20;

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>{children}</View>;
}

/** The screen title lives in the content, not in a nav bar, so it scrolls away. */
export function ScreenTitle({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: spacing.md,
        marginBottom: spacing.lg,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text role="title">{title}</Text>
        {subtitle ? <Text role="label" tone="muted">{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

export function SectionHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.sm,
        minHeight: 32,
      }}
    >
      <Text role="label" tone="muted">
        {title}
      </Text>
      {trailing}
    </View>
  );
}

/** A bordered container. Used for grouped rows, never for every single item. */
export function Panel({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.line,
          padding: padded ? spacing.lg : 0,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.line, marginLeft: inset }} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ paddingVertical: spacing.xl, gap: spacing.xs }}>
      <Text role="body" tone="muted">
        {title}
      </Text>
      {hint ? (
        <Text role="label" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Staggered entrance for list rows. Falls back to a plain view when motion is reduced. */
export function ListItemIn({
  index,
  children,
  style,
}: {
  index: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { reduceMotion } = useTheme();
  if (reduceMotion) return <View style={style}>{children}</View>;
  return (
    <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 35)} style={style}>
      {children}
    </Animated.View>
  );
}
