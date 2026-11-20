import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, ScrollView, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useCategories } from "@/features/categories/hooks";
import { useMe } from "@/features/me/hooks";
import { t } from "@/i18n/strings";
import { useMoney } from "@/lib/format";
import { mutationMessage } from "@/lib/query/mutationError";
import type { RecurringIn, RecurringOut } from "@/lib/types";
import { useTheme } from "@/theme/useTheme";
import { useCreateRecurring, usePatchRecurring, useRecurring } from "./hooks";
import { RecurringForm } from "./RecurringForm";

export function RecurringScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const money = useMoney();
  const rules = useRecurring();
  const me = useMe();
  const categories = useCategories();
  const create = useCreateRecurring();
  const patch = usePatchRecurring();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setFormError(null);
  };

  async function save(body: RecurringIn) {
    setFormError(null);
    try {
      await create.mutateAsync(body);
      close();
    } catch (e) {
      setFormError(mutationMessage(e));
    }
  }

  async function setActive(rule: RecurringOut, active: boolean) {
    setRowError(null);
    try {
      await patch.mutateAsync({ id: rule.id, body: { active } });
    } catch (e) {
      setRowError(mutationMessage(e));
    }
  }

  const categoryName = (id: string | null) =>
    categories.data?.find((c) => c.id === id)?.name;
  const title = (r: RecurringOut) =>
    r.is_primary_income
      ? t.recurring.monthlyIncome
      : (r.merchant ?? categoryName(r.category_id) ?? t.recurring.noCategory);

  const all = rules.data ?? [];
  const sections = [
    {
      key: "expense",
      label: t.recurring.expenses,
      rows: all.filter((r) => r.kind === "expense"),
    },
    {
      key: "income",
      label: t.recurring.income,
      rows: all.filter((r) => r.kind === "income"),
    },
  ];

  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text variant="title" accessibilityRole="header">
          {t.recurring.title}
        </Text>
        <Button
          testID="recurring-new"
          label={`＋ ${t.recurring.new}`}
          disabled={!me.data}
          onPress={() => setOpen(true)}
        />
      </View>
      <Text variant="caption" tone="muted">
        {t.recurring.activeHint}
      </Text>
      {rowError ? (
        <Text tone="bad" accessibilityRole="alert">
          {rowError}
        </Text>
      ) : null}
      {rules.isPending ? <Text tone="muted">{t.common.loading}</Text> : null}
      {rules.isError && !rules.data ? (
        <View style={{ gap: 8 }}>
          <Text tone="bad" accessibilityRole="alert">
            {t.recurring.loadError}
          </Text>
          <Button label={t.common.retry} onPress={() => void rules.refetch()} />
        </View>
      ) : null}
      {rules.data
        ? sections.map((s) => (
            <View key={s.key} style={{ gap: 8 }}>
              <Text variant="label" tone="muted" accessibilityRole="header">
                {s.label}
              </Text>
              {s.rows.length === 0 ? (
                <Text tone="muted">{t.recurring.emptySection}</Text>
              ) : null}
              {s.rows.map((r) => (
                <Card
                  key={r.id}
                  testID={`recurring-row-${r.id}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    opacity: r.active ? 1 : 0.6,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text>{title(r)}</Text>
                    <Text variant="caption" tone="muted">
                      {`${t.recurring.cadenceLabel(r.cadence)} · ${t.recurring.nextDue(r.next_due_on)}`}
                    </Text>
                    {r.is_primary_income ? (
                      <Text variant="caption" tone="muted">
                        {t.recurring.monthlyIncomeHint}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="label">
                    {money.format(r.amount_minor, r.currency)}
                  </Text>
                  {r.is_primary_income ? null : (
                    <View
                      style={{
                        minHeight: 44,
                        minWidth: 44,
                        justifyContent: "center",
                      }}
                    >
                      <Switch
                        testID={`recurring-active-${r.id}`}
                        accessibilityLabel={`${t.recurring.active}: ${title(r)}`}
                        value={r.active}
                        disabled={patch.isPending}
                        onValueChange={(v) => void setActive(r, v)}
                        trackColor={{ true: colors.brand }}
                      />
                    </View>
                  )}
                </Card>
              ))}
            </View>
          ))
        : null}
      <Button
        label={t.recurring.back}
        variant="ghost"
        onPress={() => router.back()}
      />
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={close}
        accessibilityViewIsModal
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <ScrollView
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {open && me.data ? (
              <RecurringForm
                currency={me.data.home_currency}
                categories={categories.data ?? []}
                busy={create.isPending}
                submitError={formError}
                onSubmit={(b) => void save(b)}
                onCancel={close}
              />
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}
