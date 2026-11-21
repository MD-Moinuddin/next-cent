import { Redirect, Tabs, usePathname, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text as UiText } from "@/components/ui/Text";
import { useMe } from "@/features/me/hooks";
import { t } from "@/i18n/strings";
import { useIdentityConfirmed } from "@/lib/auth/identity";
import { useSession } from "@/lib/auth/session";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { useTheme } from "@/theme/useTheme";

// Routable but not shown in the tab bar. (`href: null` would make expo-router treat the screen as a hidden
// tab, which redirects away from it, so Settings > Categories and the onboarding redirect would never arrive.)
const HIDDEN_TAB = { display: "none" } as const;

const icon = (glyph: string) =>
  function TabIcon() {
    return <Text accessibilityElementsHidden>{glyph}</Text>;
  };

export default function AppLayout() {
  const { isLoaded, isSignedIn, userId } = useSession();
  // Restored cache data is shown only once it is confirmed to belong to this user (bindIdentity.ts).
  const confirmed = useIdentityConfirmed(userId);
  const { isWide } = useBreakpoint();
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe(isLoaded && isSignedIn && confirmed);
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!confirmed) return null; // brief: the identity check reads local storage only
  if (me.data && !me.data.onboarding_completed && pathname !== "/onboarding")
    return <Redirect href="/onboarding" />;
  if (!me.data && me.isError)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
        }}
      >
        <UiText tone="bad" accessibilityRole="alert">
          {t.common.loadError}
        </UiText>
        <Button label={t.common.retry} onPress={() => void me.refetch()} />
      </View>
    );
  if (!me.data) return null;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: isWide ? "left" : "bottom",
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        // Explicit surfaces so the tab labels keep AA contrast (the default active background is a saturated blue).
        tabBarActiveBackgroundColor: "transparent",
        tabBarStyle: { backgroundColor: colors.card },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.home,
          tabBarIcon: icon("🏠"),
          tabBarButtonTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t.tabs.transactions,
          tabBarIcon: icon("📋"),
          tabBarButtonTestID: "tab-transactions",
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t.tabs.add,
          tabBarIcon: icon("＋"),
          tabBarButtonTestID: "tab-add",
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push("/quick-add");
          },
        }}
      />
      <Tabs.Screen
        name="summary"
        options={{
          title: t.tabs.summary,
          tabBarIcon: icon("📊"),
          tabBarButtonTestID: "tab-summary",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.tabs.settings,
          tabBarIcon: icon("⚙️"),
          tabBarButtonTestID: "tab-settings",
        }}
      />
      <Tabs.Screen
        name="onboarding"
        options={{ tabBarItemStyle: HIDDEN_TAB }}
      />
      <Tabs.Screen
        name="categories"
        options={{ tabBarItemStyle: HIDDEN_TAB }}
      />
      <Tabs.Screen name="recurring" options={{ tabBarItemStyle: HIDDEN_TAB }} />
    </Tabs>
  );
}
