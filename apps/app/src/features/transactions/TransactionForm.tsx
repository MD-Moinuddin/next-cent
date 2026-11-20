import { zodResolver } from "@hookform/resolvers/zod";
import {
  dedupeTags,
  getExponent,
  toTransactionBody,
  todayIso,
  toIsoDate,
  transactionFormSchema,
  type TransactionBody,
  type TransactionFormValues,
} from "@nextcent/shared";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Keypad, type KeypadKey } from "@/components/ui/Keypad";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { useCategories } from "@/features/categories/hooks";
import { CategoryChips } from "@/features/categories/CategoryChips";
import { orderByUsage } from "@/features/categories/order";
import { CurrencyPicker } from "@/features/onboarding/CurrencyPicker";
import { t } from "@/i18n/strings";
import { currencySymbol } from "@/lib/format";
import { fitToCurrency, normalizeAmount, pressKey } from "./amountInput";
import { useTransactionsInfinite } from "./hooks";

const USAGE_SAMPLE = { limit: 50 };

type ErrorKey = keyof typeof t.errors;
const message = (code: string | undefined, fallback: ErrorKey): string =>
  code && Object.hasOwn(t.errors, code)
    ? t.errors[code as ErrorKey]
    : t.errors[fallback];

const parseTags = (text: string): string[] =>
  dedupeTags(
    text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

/** First message found in a react-hook-form error (field, array of items, or nested). */
function firstMessage(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { message?: unknown };
  if (typeof e.message === "string" && e.message) return e.message;
  for (const v of Object.values(err)) {
    const m = firstMessage(v);
    if (m) return m;
  }
  return undefined;
}

export function yesterdayIso(now: Date = new Date()): string {
  return toIsoDate(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
  );
}

export interface TransactionFormProps {
  mode: "create" | "edit";
  initial?: Partial<TransactionFormValues>;
  baseVersion?: number;
  homeCurrency: string;
  onSubmit: (body: TransactionBody) => void;
  onDelete?: () => void;
  onCancel?: () => void;
}

export function TransactionForm({
  mode,
  initial,
  baseVersion,
  homeCurrency,
  onSubmit,
  onDelete,
  onCancel,
}: TransactionFormProps) {
  const { control, handleSubmit, setValue, formState } =
    useForm<TransactionFormValues>({
      resolver: zodResolver(transactionFormSchema),
      defaultValues: {
        kind: initial?.kind ?? "expense",
        amount: initial?.amount ?? "",
        currency: initial?.currency ?? homeCurrency,
        occurredOn: initial?.occurredOn ?? todayIso(),
        categoryId: initial?.categoryId ?? null,
        merchant: initial?.merchant ?? "",
        note: initial?.note ?? "",
        tags: initial?.tags ?? [],
      },
    });
  const [kind, amount, currency, occurredOn, categoryId] = useWatch({
    control,
    name: ["kind", "amount", "currency", "occurredOn", "categoryId"],
  });
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(", "));
  const revalidate = { shouldValidate: formState.isSubmitted };

  const categories = useCategories(true);
  const recent = useTransactionsInfinite(USAGE_SAMPLE);
  const ordered = useMemo(() => {
    const all = categories.data ?? [];
    const usage = (recent.data?.pages ?? []).flatMap((p) => p.items);
    const active = orderByUsage(all, usage);
    // Keep an archived category selected on an existing transaction visible.
    const current = all.find((c) => c.id === categoryId && c.archived_at);
    return current ? [...active, current] : active;
  }, [categories.data, recent.data, categoryId]);

  const exponent = getExponent(currency);
  const today = todayIso();
  const yesterday = yesterdayIso();
  const income = kind === "income";

  const onKey = (key: KeypadKey) => {
    if (key === "." && exponent === 0) return;
    setValue("amount", pressKey(amount, key, currency), revalidate);
  };

  const submit = () => {
    // "5." is accepted as "5": drop the dangling dot before validating.
    const normalized = normalizeAmount(amount);
    if (normalized !== amount) setValue("amount", normalized);
    return handleSubmit((values) =>
      onSubmit(toTransactionBody(values, baseVersion)),
    )();
  };

  const errors = formState.errors;
  const amountError = errors.amount
    ? errors.amount.message === "required"
      ? t.errors.amount_required
      : message(errors.amount.message, "invalid_amount")
    : undefined;
  const categoryError = errors.categoryId
    ? t.errors.category_required
    : undefined;
  const dateError = errors.occurredOn
    ? message(errors.occurredOn.message, "invalid_date")
    : undefined;
  const tagsError = errors.tags
    ? message(firstMessage(errors.tags), "generic")
    : undefined;
  const merchantError = errors.merchant
    ? message(errors.merchant.message, "generic")
    : undefined;
  const noteError = errors.note
    ? message(errors.note.message, "generic")
    : undefined;
  // Save must never fail silently: any invalid field also raises this announced summary.
  const showSummary =
    formState.submitCount > 0 && Object.keys(errors).length > 0;

  const title =
    mode === "edit"
      ? income
        ? t.form.editIncome
        : t.form.editExpense
      : income
        ? t.form.addIncome
        : t.form.addExpense;

  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {onCancel ? (
          <Button
            testID="quick-add-cancel"
            label={t.common.cancel}
            variant="ghost"
            onPress={onCancel}
          />
        ) : null}
        <Text
          variant="title"
          accessibilityRole="header"
          style={{ flexShrink: 1 }}
        >
          {title}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip
            testID="kind-expense"
            label={t.common.expense}
            selected={!income}
            onPress={() => setValue("kind", "expense", revalidate)}
          />
          <Chip
            testID="kind-income"
            label={t.common.income}
            selected={income}
            onPress={() => setValue("kind", "income", revalidate)}
          />
        </View>
      </View>

      <CurrencyPicker
        label={t.form.currency}
        value={currency}
        onSelect={(code) => {
          setValue("currency", code, revalidate);
          setValue("amount", fitToCurrency(amount, code), revalidate);
        }}
      />

      <Text
        variant="amount"
        testID="quick-add-amount"
        accessibilityRole="text"
        accessibilityLabel={`${t.form.amount}: ${amount || "0"} ${currency}`}
      >
        {`${currencySymbol(currency)}${amount || "0"}`}
      </Text>
      {amountError ? (
        <Text
          variant="caption"
          tone="bad"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {amountError}
        </Text>
      ) : null}

      {income ? null : (
        <View style={{ gap: 6 }}>
          <Text variant="label" tone="muted">
            {t.form.category}
          </Text>
          {categories.data ? (
            <CategoryChips
              categories={ordered}
              selectedId={categoryId}
              onSelect={(id) => setValue("categoryId", id, revalidate)}
            />
          ) : categories.isError ? (
            <View style={{ gap: 8 }}>
              <Text tone="bad" accessibilityRole="alert">
                {t.form.categoriesError}
              </Text>
              <Button
                testID="categories-retry"
                label={t.common.retry}
                variant="ghost"
                onPress={() => void categories.refetch()}
              />
            </View>
          ) : (
            <Text tone="muted">{t.form.loadingCategories}</Text>
          )}
          {categoryError ? (
            <Text
              variant="caption"
              tone="bad"
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {categoryError}
            </Text>
          ) : null}
        </View>
      )}

      <View style={{ gap: 6 }}>
        <Text variant="label" tone="muted">
          {t.form.date}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip
            testID="date-today"
            label={t.common.today}
            selected={occurredOn === today}
            onPress={() => setValue("occurredOn", today, revalidate)}
          />
          <Chip
            testID="date-yesterday"
            label={t.common.yesterday}
            selected={occurredOn === yesterday}
            onPress={() => setValue("occurredOn", yesterday, revalidate)}
          />
        </View>
        <TextField
          testID="quick-add-date"
          label={t.form.otherDate}
          value={occurredOn}
          onChangeText={(v) => setValue("occurredOn", v, revalidate)}
          autoCapitalize="none"
          autoCorrect={false}
          error={dateError}
        />
      </View>

      <Keypad onKey={onKey} allowDot={exponent > 0} />

      <Controller
        control={control}
        name="merchant"
        render={({ field }) => (
          <TextField
            testID="quick-add-merchant"
            label={t.form.merchant}
            value={field.value ?? ""}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={merchantError}
          />
        )}
      />
      <Controller
        control={control}
        name="note"
        render={({ field }) => (
          <TextField
            testID="quick-add-note"
            label={t.form.note}
            value={field.value ?? ""}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={noteError}
          />
        )}
      />
      <TextField
        testID="quick-add-tags"
        label={t.form.tags}
        value={tagsText}
        autoCapitalize="none"
        onChangeText={(v) => {
          setTagsText(v);
          setValue("tags", parseTags(v), revalidate);
        }}
        error={tagsError}
      />

      {showSummary ? (
        <Text
          testID="form-error-summary"
          tone="bad"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {t.errors.check_fields}
        </Text>
      ) : null}
      <Button
        testID="quick-add-save"
        label={mode === "edit" ? t.form.saveChanges : t.common.save}
        loading={formState.isSubmitting}
        onPress={() => void submit()}
      />
      {mode === "edit" && onDelete ? (
        <Button
          testID="transaction-delete"
          label={t.common.delete}
          variant="danger"
          onPress={onDelete}
        />
      ) : null}
    </View>
  );
}
