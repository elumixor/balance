import { View } from "react-native";
import { useTheme } from "../../theme";
import { Button } from "./button";
import { Text } from "./text";

/** Shown when a screen's data never arrived. Says what happened and offers the fix. */
export function LoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md, paddingVertical: spacing.xl, alignItems: "flex-start" }}>
      <Text role="body" tone="muted">
        {message ?? "Couldn't load your data."}
      </Text>
      <Button label="Try again" variant="outline" size="sm" onPress={onRetry} />
    </View>
  );
}
