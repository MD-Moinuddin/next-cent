import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/Text";
import { t } from "@/i18n/strings";
import { shadow } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

/** Shared look of the sign-in and sign-up screens: a navy brand header above the form. */
export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={{
          backgroundColor: colors.brandDeep,
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
          paddingTop: insets.top + 40,
          paddingBottom: 32,
          paddingHorizontal: 24,
          gap: 12,
          overflow: "hidden",
          ...shadow.hero,
        }}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            right: -70,
            top: -60,
            width: 240,
            height: 240,
            borderRadius: 120,
            backgroundColor: colors.heroShapeA,
          }}
        />
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            right: 60,
            bottom: -80,
            width: 150,
            height: 150,
            borderRadius: 75,
            backgroundColor: colors.heroShapeB,
          }}
        />
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{ color: colors.accentInk, fontSize: 28, fontWeight: "700" }}
          >
            N
          </Text>
        </View>
        <Text
          variant="title"
          accessibilityRole="header"
          style={{ color: colors.brandDeepInk, fontSize: 32 }}
        >
          {t.app.name}
        </Text>
        <Text style={{ color: colors.brandDeepMuted }}>{t.auth.tagline}</Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 4,
          }}
        >
          {t.auth.points.map((p) => (
            <View
              key={p}
              style={{
                backgroundColor: colors.heroShapeA,
                borderRadius: radius.pill,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Text
                variant="caption"
                style={{ color: colors.brandDeepInk, fontWeight: "600" }}
              >
                {p}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View
        style={{
          width: "100%",
          maxWidth: 480,
          alignSelf: "center",
          padding: 24,
          gap: 16,
        }}
      >
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {children}
      </View>
    </ScrollView>
  );
}
