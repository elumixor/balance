import { View } from "react-native";
import { useTheme } from "../../theme";
import { BrandMark } from "../brand-mark";

/**
 * What the app shows while it works out who you are. Rendering `null` here instead left the first
 * paint empty until Clerk had loaded — seconds of white on a cold web visit, since this markup is
 * also what the static export bakes into every page.
 */
export function AppLoading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
      <BrandMark size={56} />
    </View>
  );
}
