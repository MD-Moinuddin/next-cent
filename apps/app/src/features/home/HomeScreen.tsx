import { daysLeftInMonth } from "@nextcent/shared";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { SyncBanner } from "@/components/SyncBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useCategories } from "@/features/categories/hooks";
import { useMe } from "@/features/me/hooks";
import { currentMonth } from "@/features/summary/ranges";
import { useSummary } from "@/features/summary/hooks";
import {
  pendingBalanceDelta,
  usePendingDeletes,
  usePendingPuts,
} from "@/features/transactions/pending";
import { useTransactionsInfinite } from "@/features/transactions/hooks";
import { t } from "@/i18n/strings";
import { transactionLabel } from "@/lib/a11yLabel";
import { deviceLocale, useMoney } from "@/lib/format";
import { useTheme } from "@/theme/useTheme";
import { dayLabel, spentPercent } from "./helpers";

const RECENT = { limit: 5 };

export function HomeScreen() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const money = useMoney();
  const now = new Date();
  const month = currentMonth(now);
  const me = useMe();
  const summary = useSummary(month.from, month.to);
  const recent = useTransactionsInfinite(RECENT);
  const categories = useCategories();
  const pendingPuts = usePendingPuts();
  const pendingDeletes = usePendingDeletes();

  const failed =
    (me.isError && !me.data) ||
    (summary.isError && !summary.data) ||
    (recent.isError && !recent.data);

  if (failed) {
    return (
      <Screen>
        <SyncBanner />
        <Card style={{ gap: 12 }}>
          <Text tone="bad" accessibilityRole="alert">
            {t.home.loadError}
          </Text>
          <Button
            label={t.common.retry}
            onPress={() => {
              void me.refetch();
              void summary.refetch();
              void recent.refetch();
            }}
          />
        </Card>
      </Screen>
    );
  }

  if (!me.data || !summary.data || !recent.data) {
    return (
      <Screen>
        <SyncBanner />
        <Text tone="muted">{t.common.loading}</Text>
      </Screen>
    );
  }

  const home = me.data.home_currency;
  const balance =
    summary.data.balance_minor +
    pendingBalanceDelta(pendingPuts, pendingDeletes, home);
  const percent = spentPercent(
    summary.data.income_minor,
    summary.data.expense_minor,
  );
  const names = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const items = recent.data.pages.flatMap((p) => p.items).slice(0, 5);
  const monthName = new Intl.DateTimeFormat(deviceLocale(), {
    month: "long",
  }).format(now);

  return (
    <Screen>
      <SyncBanner />
      <View
        accessible
        accessibilityLabel={`${t.home.balance}: ${money.format(balance, home)}`}
      >
        <Text variant="caption" tone="muted">
          {t.home.balance}
        </Text>
        <Text variant="amount" testID="home-balance">
          {money.format(balance, home)}
        </Text>
      </View>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="caption" tone="muted">
            {monthName}
          </Text>
          <Text variant="caption" tone="muted">
            {t.home.daysLeft(daysLeftInMonth(now))}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text variant="caption" tone="muted">
              {t.home.income}
            </Text>
            <Text variant="label" tone="good">
              {`+ ${money.format(summary.data.income_minor, summary.data.currency)}`}
            </Text>
          </View>
          <View>
            <Text variant="caption" tone="muted">
              {t.home.spent}
            </Text>
            <Text variant="label" tone="bad">
              {`− ${money.format(summary.data.expense_minor, summary.data.currency)}`}
            </Text>
          </View>
        </View>
        {percent !== null ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t.home.spentOfIncome(percent)}
            accessibilityValue={{ min: 0, max: 100, now: percent }}
            style={{
              height: 8,
              borderRadius: radius.pill,
              backgroundColor: colors.line,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${percent}%`,
                height: "100%",
                backgroundColor: colors.brand,
              }}
            />
          </View>
        ) : null}
        {summary.data.excluded_other_currency_count > 0 ? (
          <Text variant="caption" tone="muted">
            {t.home.excluded(summary.data.excluded_other_currency_count)}
          </Text>
        ) : null}
      </Card>
      <Text variant="label" tone="muted" accessibilityRole="header">
        {t.home.recent}
      </Text>
      {items.length === 0 ? (
        <Text tone="muted">{t.home.empty}</Text>
      ) : (
        items.map((tx) => {
          const category = tx.category_id
            ? (names.get(tx.category_id) ?? t.home.uncategorized)
            : t.home.uncategorized;
          const title = tx.merchant || category;
          const amount = `${tx.kind === "income" ? "+" : "−"}${money.format(tx.amount_minor, tx.currency)}`;
          const when = dayLabel(tx.occurred_on, now, deviceLocale());
          const captionText = `${category} · ${when}`;
          return (
            <Pressable
              key={tx.id}
              testID={`recent-${tx.id}`}
              accessibilityRole="button"
              accessibilityLabel={transactionLabel({
                visible: [title, captionText, amount],
                kind: tx.kind,
                minor: tx.amount_minor,
                currency: tx.currency,
                locale: deviceLocale(),
                pending: false,
              })}
              onPress={() => router.push(`/transaction/${tx.id}` as Href)}
              style={{
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="body">{`${title} `}</Text>
                <Text variant="caption" tone="muted">
                  {`${captionText} `}
                </Text>
              </View>
              <Text
                variant="label"
                tone={tx.kind === "income" ? "good" : "default"}
              >
                {amount}
              </Text>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
