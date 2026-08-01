import { View } from "react-native";
import { useTheme } from "../../theme";
import { Text } from "./text";
import { Touchable } from "./touchable";

/**
 * A quiet switch: the active option is inked and underscored, the rest recede.
 * No pill, no floating thumb — the ring is the only strong shape on screen.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.lg }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Touchable
            key={option.value}
            onPress={() => onChange(option.value)}
            scaleTo={1}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            style={{ paddingBottom: 6, gap: 5 }}
          >
            <Text role="label" tone={active ? "default" : "faint"}>
              {option.label}
            </Text>
            <View
              style={{
                height: 2,
                borderRadius: 1,
                backgroundColor: active ? colors.ink : "transparent",
              }}
            />
          </Touchable>
        );
      })}
    </View>
  );
}
