import { Redirect, Stack } from "expo-router";
import { useSession } from "@/lib/auth/session";

export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useSession();
  if (isLoaded && isSignedIn) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
