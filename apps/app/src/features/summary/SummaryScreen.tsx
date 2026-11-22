import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { t } from "@/i18n/strings";
import { useMoney } from "@/lib/format";
import { useTheme } from "@/theme/useTheme";
import { useSummary } from "./hooks";
import {
  currentMonth,
  rangeFor,
  shiftReference,
  validateCustomRange,
  type SummaryMode,
} from "./ranges";
import { DonutChart } from "./DonutChart";
import { SummaryBars } from "./SummaryBars";

export function SummaryScreen() {
  const money = useMoney();
  const { colors, chart } = useTheme();
  const [mode, setMode] = useState<SummaryMode>("month");
  const [ref, setRef] = useState(() => new Date());
  const initial = currentMonth();
  const [customFrom, setCustomFrom] = useState(initial.from);
  const [customTo, setCustomTo] = useState(initial.to);

  const custom = validateCustomRange(customFrom, customTo);
  const range =
    mode === "custom"
      ? custom.ok
        ? { from: custom.from, to: custom.to }
        : null
      : rangeFor(mode, ref);
  const summary = useSummary(
    range?.from ?? "",
    range?.to ?? "",
    range !== null,
  );
  const data = summary.data;

  const modes: [SummaryMode, string][] = [
    ["week", t.summary.week],
    ["month", t.summary.month],
    ["custom", t.summary.custom],
  ];
  const isEmpty =
    !!data &&
    data.income_minor === 0 &&
    data.expense_minor === 0 &&
    data.by_category.length === 0;

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {t.summary.title}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {modes.map(([m, label]) => (
          <Chip
            key={m}
            testID={`summary-mode-${m}`}
            label={label}
            selected={mode === m}
            onPress={() => setMode(m)}
          />
        ))}
      </View>

      {mode === "custom" ? (
        <View style={{ gap: 8 }}>
          <TextField
            testID="summary-from"
            label={t.summary.from}
            value={customFrom}
            onChangeText={setCustomFrom}
            autoCapitalize="none"
            autoCorrect={false}
            error={!custom.ok ? t.errors[custom.error] : undefined}
          />
          <TextField
            testID="summary-to"
            label={t.summary.to}
            value={customTo}
            onChangeText={setCustomTo}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Button
            testID="summary-prev"
            label={t.summary.previous}
            variant="ghost"
            onPress={() => setRef((r) => shiftReference(mode, r, -1))}
          />
          <Text
            variant="label"
            testID="summary-range"
            style={{ flexShrink: 1 }}
          >
            {range ? t.summary.rangeLabel(range.from, range.to) : ""}
          </Text>
          <Button
            testID="summary-next"
            label={t.summary.next}
            variant="ghost"
            onPress={() => setRef((r) => shiftReference(mode, r, 1))}
          />
        </View>
      )}

      {range && summary.isPending ? (
        <Text tone="muted">{t.common.loading}</Text>
      ) : null}
      {range && summary.isError && !data ? (
        <View style={{ gap: 8 }}>
          <Text tone="bad" accessibilityRole="alert">
            {t.summary.loadError}
          </Text>
          <Button
            label={t.common.retry}
            onPress={() => void summary.refetch()}
          />
        </View>
      ) : null}
      {range && data ? (
        isEmpty ? (
          <Text tone="muted" testID="summary-empty">
            {t.summary.empty}
          </Text>
        ) : (
          <>
            <Card
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {data.by_category.length > 0 ? (
                <DonutChart
                  segments={data.by_category.map((c, i) => ({
                    id: c.category_id,
                    value: c.total_minor,
                    color: chart[i % chart.length]!,
                  }))}
                  centerLabel={t.summary.spent}
                  centerValue={money.format(data.expense_minor, data.currency)}
                  track={colors.chip}
                  textColor={colors.ink}
                  mutedColor={colors.muted}
                />
              ) : null}
              <View style={{ flex: 1, minWidth: 160, gap: 10 }}>
                <Line
                  label={t.summary.income}
                  value={money.format(data.income_minor, data.currency)}
                  tone="good"
                />
                <Line
                  label={t.summary.spent}
                  value={money.format(data.expense_minor, data.currency)}
                />
                <Line
                  label={t.summary.net}
                  value={money.format(data.net_minor, data.currency)}
                  tone={data.net_minor < 0 ? "bad" : "good"}
                />
              </View>
            </Card>
            {data.by_category.length > 0 ? (
              <Card style={{ gap: 12 }}>
                <Text variant="label" tone="muted" accessibilityRole="header">
                  {t.summary.byCategory}
                </Text>
                <SummaryBars
                  currency={data.currency}
                  rows={data.by_category.map((c) => ({
                    id: c.category_id,
                    icon: c.icon,
                    name: c.name,
                    total: c.total_minor,
                  }))}
                />
              </Card>
            ) : null}
          </>
        )
      ) : null}
      {range && data && data.excluded_other_currency_count > 0 ? (
        <Text variant="caption" tone="muted" testID="summary-excluded">
          {t.summary.excluded(data.excluded_other_currency_count)}
        </Text>
      ) : null}
    </Screen>
  );
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={{ flexDirection: "row", justifyContent: "space-between" }}
    >
      <Text tone="muted">{label}</Text>
      <Text variant="label" tone={tone ?? "default"} style={{ fontSize: 16 }}>
        {value}
      </Text>
    </View>
  );
}
