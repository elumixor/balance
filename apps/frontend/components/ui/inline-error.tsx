import { View } from "react-native";
import { useTheme } from "../../theme";
import { Text } from "./text";

/** Says what just failed, in place, without stealing the screen the way an alert would. */
export function InlineError({ message }: { message: string | null }) {
  const { spacing } = useTheme();
  if (!message) return null;
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text role="micro" tone="danger">
        {message}
      </Text>
    </View>
  );
}
