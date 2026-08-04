import { View } from "react-native";
import { useTheme } from "../../theme";
import { Button } from "./button";
import { Panel } from "./layout";
import { Text } from "./text";

/** Shown when a screen's data never arrived. Says what happened and offers the fix. */
export function LoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  const { spacing } = useTheme();
  return (
    <Panel>
      <View style={{ gap: spacing.md, alignItems: "flex-start" }}>
        <View style={{ gap: spacing.xs }}>
          <Text role="body">Couldn't load your data</Text>
          <Text role="label" tone="muted">
            {message ?? "Something went wrong on the way to the server."}
          </Text>
        </View>
        <Button label="Try again" variant="outline" size="sm" onPress={onRetry} />
      </View>
    </Panel>
  );
}
