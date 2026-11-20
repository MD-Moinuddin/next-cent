import { zodResolver } from "@hookform/resolvers/zod";
import { MoneyError, parseAmount, todayIso } from "@nextcent/shared";
import { Controller, useForm, useWatch } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { CategoryChips } from "@/features/categories/CategoryChips";
import { fieldError } from "@/features/onboarding/messages";
import { isRealIsoDate } from "@/features/summary/ranges";
import { t } from "@/i18n/strings";
import type { CategoryOut, RecurringIn } from "@/lib/types";

// The API accepts a start date from 366 days back to 3660 days ahead of its UTC date. The form keeps
// one day inside each end so a local date near midnight (up to a day off UTC) is never rejected there.
export const ANCHOR_PAST_DAYS = 365;
export const ANCHOR_FUTURE_DAYS = 3659;

/** ISO date `days` after `iso` (calendar arithmetic in UTC, so no DST effects). */
export function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function anchorWindow(today: string = todayIso()): {
  min: string;
  max: string;
} {
  return {
    min: shiftIsoDate(today, -ANCHOR_PAST_DAYS),
    max: shiftIsoDate(today, ANCHOR_FUTURE_DAYS),
  };
}

const makeSchema = (currency: string, window = anchorWindow()) =>
  z
    .object({
      kind: z.enum(["expense", "income"]),
      amount: z.string().trim().min(1, "amount_required"),
      categoryId: z.string().nullable(),
      cadence: z.enum(["weekly", "monthly", "yearly"]),
      startDate: z
        .string()
        .trim()
        .refine(
          (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && isRealIsoDate(s),
          "invalid_date",
        )
        .refine(
          (s) => s >= window.min && s <= window.max,
          "anchor_out_of_range",
        ),
      merchant: z.string().trim().max(120, "merchant_too_long"),
    })
    .superRefine((v, ctx) => {
      if (v.amount.trim()) {
        try {
          if (parseAmount(v.amount, currency) <= 0)
            throw new MoneyError("invalid_amount");
        } catch (e) {
          ctx.addIssue({
            code: "custom",
            path: ["amount"],
            message: e instanceof MoneyError ? e.code : "invalid_amount",
          });
        }
      }
      if (v.kind === "expense" && !v.categoryId)
        ctx.addIssue({
          code: "custom",
          path: ["categoryId"],
          message: "category_required",
        });
    });
export type RecurringFormValues = z.infer<ReturnType<typeof makeSchema>>;

/** Converts validated form values into the API body (amount parsed in the home currency's exponent). */
export function toRecurringIn(
  v: RecurringFormValues,
  currency: string,
): RecurringIn {
  return {
    kind: v.kind,
    amount_minor: parseAmount(v.amount, currency),
    currency,
    cadence: v.cadence,
    anchor_on: v.startDate.trim(),
    category_id: v.kind === "expense" ? v.categoryId : null,
    merchant: v.merchant.trim() || null,
  };
}

export function RecurringForm({
  currency,
  categories,
  busy,
  submitError,
  onSubmit,
  onCancel,
}: {
  currency: string;
  categories: CategoryOut[];
  busy: boolean;
  submitError: string | null;
  onSubmit: (body: RecurringIn) => void;
  onCancel: () => void;
}) {
  const { control, handleSubmit } = useForm<RecurringFormValues>({
    resolver: zodResolver(makeSchema(currency)),
    defaultValues: {
      kind: "expense",
      amount: "",
      categoryId: null,
      cadence: "monthly",
      startDate: todayIso(),
      merchant: "",
    },
  });
  const kind = useWatch({ control, name: "kind" });

  const submit = handleSubmit((values) =>
    onSubmit(toRecurringIn(values, currency)),
  );

  return (
    <View style={{ gap: 12 }}>
      <Text variant="title" accessibilityRole="header">
        {t.recurring.newTitle}
      </Text>
      <Controller
        control={control}
        name="kind"
        render={({ field }) => (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip
              testID="recurring-kind-expense"
              label={t.common.expense}
              selected={field.value === "expense"}
              onPress={() => field.onChange("expense")}
            />
            <Chip
              testID="recurring-kind-income"
              label={t.common.income}
              selected={field.value === "income"}
              onPress={() => field.onChange("income")}
            />
          </View>
        )}
      />
      <Controller
        control={control}
        name="amount"
        render={({ field, fieldState }) => (
          <TextField
            testID="recurring-amount"
            label={`${t.recurring.amount} (${currency})`}
            keyboardType="decimal-pad"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldError(fieldState.error?.message, field.value)}
          />
        )}
      />
      {kind === "expense" ? (
        <Controller
          control={control}
          name="categoryId"
          render={({ field, fieldState }) => (
            <View style={{ gap: 4 }}>
              <Text variant="label" tone="muted">
                {t.recurring.category}
              </Text>
              <CategoryChips
                categories={categories}
                selectedId={field.value}
                onSelect={field.onChange}
              />
              {fieldState.error ? (
                <Text
                  variant="caption"
                  tone="bad"
                  accessibilityLiveRegion="polite"
                >
                  {fieldError(fieldState.error.message)}
                </Text>
              ) : null}
            </View>
          )}
        />
      ) : null}
      <Controller
        control={control}
        name="cadence"
        render={({ field }) => (
          <View style={{ gap: 4 }}>
            <Text variant="label" tone="muted">
              {t.recurring.cadence}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(["weekly", "monthly", "yearly"] as const).map((c) => (
                <Chip
                  key={c}
                  testID={`recurring-cadence-${c}`}
                  label={t.recurring[c]}
                  selected={field.value === c}
                  onPress={() => field.onChange(c)}
                />
              ))}
            </View>
          </View>
        )}
      />
      <Controller
        control={control}
        name="startDate"
        render={({ field, fieldState }) => (
          <TextField
            testID="recurring-start"
            label={t.recurring.startDate}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="none"
            autoCorrect={false}
            error={fieldError(fieldState.error?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="merchant"
        render={({ field, fieldState }) => (
          <TextField
            testID="recurring-merchant"
            label={t.recurring.merchant}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldError(fieldState.error?.message)}
          />
        )}
      />
      {submitError ? (
        <Text
          tone="bad"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {submitError}
        </Text>
      ) : null}
      <Button
        testID="recurring-save"
        label={t.recurring.create}
        loading={busy}
        onPress={() => void submit()}
      />
      <Button
        testID="recurring-cancel"
        label={t.common.cancel}
        variant="ghost"
        disabled={busy}
        onPress={onCancel}
      />
    </View>
  );
}
