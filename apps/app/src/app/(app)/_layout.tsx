import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, usePathname, useRouter } from "expo-router";
import { View, type ColorValue } from "react-native";
import { AddTabButton } from "@/components/AddTabButton";
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

type IconName = keyof typeof Ionicons.glyphMap;
// Outline when inactive, filled when active.
const icon = (outline: IconName, filled: IconName) =>
  function TabIcon({
    color,
    focused,
  }: {
    color: ColorValue;
    focused: boolean;
  }) {
    return (
      <Ionicons
        name={focused ? filled : outline}
        size={24}
        color={color as string}
        accessibilityElementsHidden
      />
    );
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
          // Onboarding is a focused flow: no tab bar until it is finished.
          ...(pathname === "/onboarding" ? { display: "none" as const } : {}),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.home,
          tabBarIcon: icon("home-outline", "home"),
          tabBarButtonTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t.tabs.transactions,
          tabBarIcon: icon("list-outline", "list"),
          tabBarButtonTestID: "tab-transactions",
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t.tabs.add,
          tabBarButton: (props) => (
            <AddTabButton
              onPress={props.onPress}
              testID="tab-add"
              raised={!isWide}
            />
          ),
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
          tabBarIcon: icon("bar-chart-outline", "bar-chart"),
          tabBarButtonTestID: "tab-summary",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.tabs.settings,
          tabBarIcon: icon("settings-outline", "settings"),
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
