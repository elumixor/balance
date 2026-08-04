import { View } from "react-native";
import { useTheme } from "../../theme";
import { swatchPalette } from "../../theme/colors";
import { Popover } from "../ui/popover";
import { Dot } from "../ui/split-bar";
import { Touchable } from "../ui/touchable";

export function ColorPicker({
  color,
  onChange,
  taken,
}: {
  color: string;
  onChange: (color: string) => void;
  /** Colours already in use elsewhere are dimmed but still selectable. */
  taken: string[];
}) {
  const { colors, spacing, radii } = useTheme();

  return (
    <Popover
      width={196}
      align="start"
      render={(open) => (
        <Touchable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel="Change colour"
          scaleTo={0.9}
          style={{
            width: 30,
            height: 30,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Dot color={color} size={14} />
        </Touchable>
      )}
      content={(close) => (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            padding: spacing.md,
          }}
        >
          {swatchPalette.map((swatch) => (
            <Touchable
              key={swatch}
              onPress={() => {
                onChange(swatch);
                close();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Use colour ${swatch}`}
              scaleTo={0.88}
              style={{
                width: 28,
                height: 28,
                borderRadius: radii.md,
                backgroundColor: swatch,
                opacity: taken.includes(swatch) && swatch !== color ? 0.35 : 1,
                borderWidth: swatch === color ? 2 : 0,
                borderColor: colors.text,
              }}
            />
          ))}
        </View>
      )}
    />
  );
}
