import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Tabs } from "expo-router";
import PieChart from "lucide-react-native/icons/chart-pie";
import Scale from "lucide-react-native/icons/scale";
import Shapes from "lucide-react-native/icons/shapes";
import Timer from "lucide-react-native/icons/timer";
import { AppLoading } from "../../components/ui/app-loading";
import { useTheme } from "../../theme";

export default function AppLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { colors, fonts } = useTheme();

  if (!isLoaded) return <AppLoading />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 0.1 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen
        name="track"
        options={{ title: "Track", tabBarIcon: ({ color }) => <Timer color={color} size={20} /> }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: "Balance", tabBarIcon: ({ color }) => <Scale color={color} size={20} /> }}
      />
      <Tabs.Screen
        name="categories"
        options={{ title: "Week", tabBarIcon: ({ color }) => <PieChart color={color} size={20} /> }}
      />
      <Tabs.Screen
        name="activities"
        options={{ title: "Activities", tabBarIcon: ({ color }) => <Shapes color={color} size={20} /> }}
      />
    </Tabs>
  );
}
