import { monthRange } from "@nextcent/shared";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, SectionList, View } from "react-native";
import { SyncBanner } from "@/components/SyncBanner";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { useCategories } from "@/features/categories/hooks";
import { dayLabel } from "@/features/home/helpers";
import { t } from "@/i18n/strings";
import { deviceLocale, formatMoney } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { CategoryFilter } from "./CategoryFilter";
import { dayNet, groupByDate } from "./group";
import { useTransactionsInfinite, type TransactionFilters } from "./hooks";
import { pendingIds, usePendingPuts } from "./pending";
import { TransactionRow } from "./TransactionRow";

type Range = "month" | "last" | "all";
type Kind = "all" | "expense" | "income";
const PAGE_SIZE = 30;
export const SEARCH_DEBOUNCE_MS = 300;

export function rangeFilter(
  range: Range,
  now: Date,
): Pick<TransactionFilters, "from" | "to"> {
  if (range === "month") return monthRange(now);
  if (range === "last")
    return monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return {};
}

export function TransactionsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<Range>("month");
  const [kind, setKind] = useState<Kind>("all");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const q = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const filters = useMemo<TransactionFilters>(
    () => ({
      limit: PAGE_SIZE,
      ...rangeFilter(range, new Date()),
      ...(kind !== "all" ? { kind } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(q ? { q } : {}),
    }),
    [range, kind, categoryId, q],
  );
  const list = useTransactionsInfinite(filters);
  const categories = useCategories();
  const pending = pendingIds(usePendingPuts());
  const byId = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );
  const sections = useMemo(
    () => groupByDate(list.data?.pages.flatMap((p) => p.items) ?? []),
    [list.data],
  );
  const now = new Date();
  const locale = deviceLocale();
  const filtered = range !== "month" || kind !== "all" || !!categoryId || !!q;

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <SyncBanner />
      <Text variant="title" accessibilityRole="header">
        {t.transactions.title}
      </Text>
      <TextField
        testID="tx-search"
        label={t.common.search}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(
          [
            ["month", t.transactions.thisMonth],
            ["last", t.transactions.lastMonth],
            ["all", t.transactions.all],
          ] as const
        ).map(([value, label]) => (
          <Chip
            key={value}
            testID={`range-${value}`}
            label={label}
            selected={range === value}
            onPress={() => setRange(value)}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(
          [
            ["all", t.transactions.allTypes],
            ["expense", t.common.expense],
            ["income", t.common.income],
          ] as const
        ).map(([value, label]) => (
          <Chip
            key={value}
            testID={`kind-${value}`}
            label={label}
            selected={kind === value}
            onPress={() => setKind(value)}
          />
        ))}
        <CategoryFilter value={categoryId} onChange={setCategoryId} />
      </View>
    </View>
  );

  let empty;
  if (list.isError && !list.data) {
    empty = (
      <View style={{ gap: 12 }}>
        <Text tone="bad" accessibilityRole="alert">
          {t.transactions.loadError}
        </Text>
        <Button label={t.common.retry} onPress={() => void list.refetch()} />
      </View>
    );
  } else if (list.isPending) {
    empty = <Text tone="muted">{t.common.loading}</Text>;
  } else {
    empty = (
      <Text tone="muted" testID="tx-empty">
        {filtered ? t.transactions.noResults : t.transactions.empty}
      </Text>
    );
  }

  return (
    <Screen scroll={false}>
      <SectionList
        testID="tx-list"
        sections={sections}
        keyExtractor={(tx) => tx.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <Text tone="muted">{t.transactions.loadingMore}</Text>
          ) : undefined
        }
        renderSectionHeader={({ section }) => {
          const net = dayNet(section.data);
          return (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
                paddingTop: 16,
                paddingBottom: 8,
              }}
            >
              <Text variant="label" tone="muted" accessibilityRole="header">
                {dayLabel(section.title, now, locale)}
              </Text>
              {net ? (
                <Text variant="label" tone="muted">
                  {`${net.minor < 0 ? "−" : "+"}${formatMoney(Math.abs(net.minor), net.currency, locale)}`}
                </Text>
              ) : null}
            </View>
          );
        }}
        renderItem={({ item, index, section }) => (
          <TransactionRow
            tx={item}
            category={item.category_id ? byId.get(item.category_id) : undefined}
            pending={pending.has(item.id)}
            first={index === 0}
            last={index === section.data.length - 1}
            onPress={() => router.push(`/transaction/${item.id}` as Href)}
          />
        )}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage)
            void list.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => void list.refetch()}
          />
        }
      />
    </Screen>
  );
}
