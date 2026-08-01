import { View } from "react-native";
import { useTheme } from "../../theme";
import { SplitBar, type Split } from "../ui/split-bar";
import { Text } from "../ui/text";
import { Touchable } from "../ui/touchable";

export type StartTile = { id: string; name: string; splits: Split[] };

/**
 * Starting a timer is the app's most-used action, so it gets tiles rather than a
 * list — and each tile carries the activity's category mix, which is the thing
 * you're really choosing between.
 */
export function QuickStart({
  tiles,
  onStart,
  startingId,
}: {
  tiles: StartTile[];
  onStart: (id: string) => void;
  startingId: string | null;
}) {
  const { colors, spacing, radii } = useTheme();

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {tiles.map((tile) => (
        <Touchable
          key={tile.id}
          onPress={() => onStart(tile.id)}
          disabled={startingId !== null}
          accessibilityRole="button"
          accessibilityLabel={`Start ${tile.name}`}
          style={{
            flexGrow: 1,
            flexBasis: "46%",
            justifyContent: "space-between",
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: startingId === tile.id ? colors.lineStrong : colors.line,
            backgroundColor: colors.surface,
          }}
        >
          <Text role="bodyStrong" numberOfLines={2}>
            {tile.name}
          </Text>
          <SplitBar splits={tile.splits} height={5} />
        </Touchable>
      ))}
    </View>
  );
}
