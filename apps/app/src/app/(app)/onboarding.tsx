import { useRouter } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { OnboardingForm } from "@/features/onboarding/OnboardingForm";
import { t } from "@/i18n/strings";

export default function Onboarding() {
  const router = useRouter();
  return (
    <Screen>
      <Text variant="caption" tone="muted">
        {t.onboarding.step}
      </Text>
      <Text variant="title" accessibilityRole="header">
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
