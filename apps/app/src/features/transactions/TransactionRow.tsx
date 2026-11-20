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
  onPress,
}: {
  tx: TransactionOut;
  category?: CategoryOut;
  pending: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
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
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <Text accessibilityElementsHidden importantForAccessibility="no">
        {income ? "💼" : (category?.icon ?? "🧾")}
      </Text>
      <View style={{ flex: 1 }}>
        <Text>{`${title} `}</Text>
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
