import { zodResolver } from "@hookform/resolvers/zod";
import {
  onboardingSchema,
  toMePatch,
  isSupportedCurrency,
  type OnboardingValues,
} from "@nextcent/shared";
import { Ionicons } from "@expo/vector-icons";
import { getLocales } from "expo-localization";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { t } from "@/i18n/strings";
import { useTheme } from "@/theme/useTheme";
import { useMe, usePatchMe } from "@/features/me/hooks";
import { CurrencyPicker } from "./CurrencyPicker";
import { fieldError, saveError } from "./messages";

/**
 * While onboarding is incomplete the device currency is the default (if supported), then the
 * server's home currency, then USD. Once completed (editing), the server currency is kept.
 */
export function startingCurrency(me?: {
  home_currency: string;
  onboarding_completed: boolean;
}): string {
  const server = me?.home_currency;
  if (me?.onboarding_completed) return server ?? "USD";
  const device = getLocales()[0]?.currencyCode;
  if (device && isSupportedCurrency(device)) return device;
  return server ?? "USD";
}

export function OnboardingForm({
  initial,
  submitLabel,
  onDone,
  allowSkip,
}: {
  initial?: Partial<OnboardingValues>;
  submitLabel: string;
  onDone: () => void;
  allowSkip?: boolean;
}) {
  const { colors } = useTheme();
  const patchMe = usePatchMe();
  const me = useMe();
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const { control, handleSubmit, setValue, formState } =
    useForm<OnboardingValues>({
      resolver: zodResolver(onboardingSchema),
      defaultValues: {
        currency: initial?.currency ?? startingCurrency(me.data),
        openingBalance: initial?.openingBalance ?? "",
        monthlyIncome: initial?.monthlyIncome ?? "",
      },
    });
  const currency = useWatch({ control, name: "currency" });

  const submit = handleSubmit(async (values) => {
    setSaveFailure(null);
    try {
      await patchMe.mutateAsync(
        toMePatch(values, { completeOnboarding: true }),
      );
      onDone();
    } catch (e) {
      setSaveFailure(saveError(e));
    }
  });

  async function skip() {
    setSaveFailure(null);
    try {
      await patchMe.mutateAsync({ onboarding_completed: true });
      onDone();
    } catch (e) {
      setSaveFailure(saveError(e));
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <CurrencyPicker
        label={t.onboarding.currency}
        value={currency}
        onSelect={(code) =>
          setValue("currency", code, { shouldValidate: formState.isSubmitted })
        }
      />
      {formState.errors.currency ? (
        <Text variant="caption" tone="bad" accessibilityLiveRegion="polite">
          {fieldError(formState.errors.currency.message)}
        </Text>
      ) : null}
      <Controller
        control={control}
        name="openingBalance"
        render={({ field, fieldState }) => (
          <TextField
            testID="onboarding-opening"
            label={t.onboarding.opening}
            keyboardType="decimal-pad"
            value={field.value ?? ""}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldError(fieldState.error?.message, field.value)}
          />
        )}
      />
      <Controller
        control={control}
        name="monthlyIncome"
        render={({ field, fieldState }) => (
          <TextField
            testID="onboarding-income"
            label={t.onboarding.income}
            keyboardType="decimal-pad"
            value={field.value ?? ""}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldError(fieldState.error?.message, field.value)}
          />
        )}
      />
      <Card
        style={{
          flexDirection: "row",
          gap: 12,
          alignItems: "flex-start",
          backgroundColor: colors.chip,
          borderColor: colors.chip,
        }}
      >
        <Ionicons
          name="information-circle-outline"
          size={22}
          color={colors.brand}
          accessibilityElementsHidden
        />
        <Text variant="caption" style={{ flex: 1, color: colors.chipInk }}>
          {t.onboarding.explainer}
        </Text>
      </Card>
      {saveFailure ? (
        <Text
          tone="bad"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {saveFailure}
        </Text>
      ) : null}
      <Button
        testID="onboarding-continue"
        label={submitLabel}
        loading={patchMe.isPending}
        onPress={() => void submit()}
      />
      {allowSkip ? (
        <Button
          testID="onboarding-skip"
          label={t.common.skip}
          variant="ghost"
          disabled={patchMe.isPending}
          onPress={() => void skip()}
        />
      ) : null}
    </View>
  );
}
