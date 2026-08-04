import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";
import { AppLoading } from "../../components/ui/app-loading";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <AppLoading />;
  if (isSignedIn) return <Redirect href="/track" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
