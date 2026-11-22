import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { OnboardingForm } from "@/features/onboarding/OnboardingForm";
import { t } from "@/i18n/strings";
import { useTheme } from "@/theme/useTheme";

export default function Onboarding() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  return (
    <Screen>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.lg,
          backgroundColor: colors.chip,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        <Ionicons name="wallet-outline" size={28} color={colors.brand} />
      </View>
      <Text variant="caption" tone="muted">
        {t.onboarding.step}
      </Text>
      <Text variant="title" accessibilityRole="header" style={{ fontSize: 30 }}>
        {t.onboarding.title}
      </Text>
      <OnboardingForm
        allowSkip
        submitLabel={t.onboarding.continue}
        onDone={() => router.replace("/")}
      />
    </Screen>
  );
}
