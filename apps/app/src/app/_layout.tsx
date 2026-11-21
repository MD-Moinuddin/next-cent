import { Stack } from "expo-router";
import { ToastProvider } from "@/components/ui/Toast";
import { AuthProvider } from "@/lib/auth/ClerkAuth";
import { QueryProvider } from "@/lib/query/persist";
import "@/features/transactions/mutations"; // registers offline mutation defaults before hydration

export default function RootLayout() {
  return (
    <AuthProvider>
      <QueryProvider>
        <ToastProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen
              name="quick-add"
              options={{ presentation: "modal" }}
            />
            <Stack.Screen name="transaction/[id]" />
          </Stack>
        </ToastProvider>
      </QueryProvider>
    </AuthProvider>
  );
}
