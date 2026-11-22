import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { transactionLabel } from "@/lib/a11yLabel";
import { t } from "@/i18n/strings";
import { deviceLocale, formatMoney } from "@/lib/format";
import { slug } from "@/lib/slug";
import type { CategoryOut, TransactionOut } from "@/lib/types";
import { useTheme } from "@/theme/useTheme";

export function TransactionRow({
  tx,
  category,
  pending,
  first = true,
  last = true,
  onPress,
}: {
  tx: TransactionOut;
  category?: CategoryOut;
  pending: boolean;
  first?: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  const locale = deviceLocale();
  const income = tx.kind === "income";
  const categoryName = category?.name ?? t.transactions.uncategorized;
  const title = tx.merchant || (income ? t.common.income : categoryName);
  const sign = income ? "+" : "−";
  const amount = `${sign}${formatMoney(tx.amount_minor, tx.currency, locale)}`;
  const tags = tx.tags.map((g) => `#${g}`).join(" ");
  const caption = [income ? t.common.income : categoryName, tags]
    .filter(Boolean)
    .join(" · ");
  const captionText = `${caption}${pending ? ` · ⏳ ${t.transactions.pendingSync}` : ""}`;
  const label = transactionLabel({
    visible: [title, captionText, amount],
    kind: tx.kind,
    minor: tx.amount_minor,
    currency: tx.currency,
    locale,
    pending,
  });
  return (
    <Pressable
      testID={`tx-row-${slug(title)}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 64,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        backgroundColor: colors.card,
        borderColor: colors.line,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: first ? 1 : 0,
        borderBottomWidth: 1,
        borderTopLeftRadius: first ? radius.lg : 0,
        borderTopRightRadius: first ? radius.lg : 0,
        borderBottomLeftRadius: last ? radius.lg : 0,
        borderBottomRightRadius: last ? radius.lg : 0,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.md,
          backgroundColor: colors.chip,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text>{income ? "💼" : (category?.icon ?? "🧾")}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "600" }}>{`${title} `}</Text>
        <Text variant="caption" tone="muted">
          {`${captionText} `}
        </Text>
      </View>
      <Text variant="label" tone={income ? "good" : "bad"}>
        {amount}
      </Text>
    </Pressable>
  );
}
