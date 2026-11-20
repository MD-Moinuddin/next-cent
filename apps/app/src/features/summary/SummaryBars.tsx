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
  const { colors } = useTheme();
  const money = useMoney();
  const widths = barWidths(rows.map((r) => r.total));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((r, i) => (
        <View
          key={r.id}
          accessible
          accessibilityLabel={`${r.name}, ${money.format(r.total, currency)}`}
          style={{ gap: 4 }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text>{`${r.icon} ${r.name}`}</Text>
            <Text variant="label">{money.format(r.total, currency)}</Text>
          </View>
          <View
            style={{
              height: 8,
              borderRadius: 6,
              backgroundColor: colors.chip,
              overflow: "hidden",
            }}
          >
            <View
              testID={`bar-${r.id}`}
              style={{
                width: `${widths[i] ?? 0}%`,
                height: "100%",
                backgroundColor: colors.brand,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
