import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "../../theme";
import { Text } from "./text";
import { Touchable } from "./touchable";

export function Chip({
  label,
  selected,
  onPress,
  leading,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  leading?: ReactNode;
}) {
  const { colors, spacing, radii } = useTheme();
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs + 2,
        paddingVertical: spacing.sm - 1,
        paddingHorizontal: spacing.md,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: selected ? colors.ink : colors.line,
        backgroundColor: selected ? colors.ink : colors.surface,
      }}
    >
      {leading}
      <Text role="label" color={selected ? colors.inkText : colors.text}>
        {label}
      </Text>
    </Touchable>
  );
}

/** A read-only marker for a category share; colour comes from the category itself. */
export function Tag({ label, color }: { label: string; color: string }) {
  const { spacing, radii } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingVertical: 3,
        paddingHorizontal: spacing.sm,
        borderRadius: radii.sm,
        backgroundColor: `${color}1f`,
      }}
    >
      <Text role="micro" color={color}>
        {label}
      </Text>
    </View>
  );
}
