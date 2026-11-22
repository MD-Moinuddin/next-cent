import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { useMoney } from "@/lib/format";
import { useTheme } from "@/theme/useTheme";

/** Percent of the largest total, rounded; 0 for an empty or all-zero list. */
export function barWidths(totals: number[]): number[] {
  const max = Math.max(0, ...totals);
  return totals.map((v) => (max === 0 ? 0 : Math.round((v / max) * 100)));
}

export function SummaryBars({
  rows,
  currency,
}: {
  rows: { id: string; icon: string; name: string; total: number }[];
  currency: string;
}) {
  const { colors, chart, radius } = useTheme();
  const money = useMoney();
  const widths = barWidths(rows.map((r) => r.total));
  const sum = rows.reduce((a, r) => a + r.total, 0);
  return (
    <View style={{ gap: 14 }}>
      {rows.map((r, i) => {
        const color = chart[i % chart.length]!;
        const percent = sum === 0 ? 0 : Math.round((r.total / sum) * 100);
        return (
          <View
            key={r.id}
            accessible
            accessibilityLabel={`${r.name}, ${money.format(r.total, currency)}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: radius.md,
                backgroundColor: colors.chip,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text>{r.icon}</Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontWeight: "600" }}>{r.name}</Text>
                <Text variant="label" style={{ fontSize: 15 }}>
                  {money.format(r.total, currency)}
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.chip,
                    overflow: "hidden",
                  }}
                >
                  <View
                    testID={`bar-${r.id}`}
                    style={{
                      width: `${widths[i] ?? 0}%`,
                      height: "100%",
                      backgroundColor: color,
                    }}
                  />
                </View>
                <Text
                  variant="caption"
                  tone="muted"
                  style={{ width: 34, textAlign: "right" }}
                >
                  {`${percent}%`}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
