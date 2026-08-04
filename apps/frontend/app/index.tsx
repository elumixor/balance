import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import { AppLoading } from "../components/ui/app-loading";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <AppLoading />;
  return <Redirect href={isSignedIn ? "/track" : "/sign-in"} />;
}
