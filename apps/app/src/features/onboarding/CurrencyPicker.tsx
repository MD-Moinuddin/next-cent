import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { t } from "@/i18n/strings";
import { deviceLocale } from "@/lib/format";
import { useTheme } from "@/theme/useTheme";
import { currencyOptions } from "./currencies";

export function CurrencyPicker({
  value,
  onSelect,
  label,
}: {
  value: string;
  onSelect: (code: string) => void;
  label: string;
}) {
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(
    () => currencyOptions(deviceLocale(), query),
    [query],
  );
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  return (
    <View style={{ gap: 4 }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Pressable
        testID="currency-picker-open"
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={() => setOpen(true)}
        style={{
          minHeight: 48,
          justifyContent: "center",
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          backgroundColor: colors.card,
        }}
      >
        <Text>{`${value} ▾`}</Text>
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={close}
        accessibilityViewIsModal
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 }}
        >
          <Text variant="title">{t.onboarding.chooseCurrency}</Text>
          <TextField
            label={t.onboarding.searchCurrency}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FlatList
            data={options}
            keyExtractor={(o) => o.code}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text tone="muted">{t.onboarding.noMatches}</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                testID={`currency-option-${item.code}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.code} ${item.name}`}
                accessibilityState={{ selected: item.code === value }}
                onPress={() => {
                  onSelect(item.code);
                  close();
                }}
                style={{
                  minHeight: 48,
                  justifyContent: "center",
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <Text>{`${item.code}  ${item.name}`}</Text>
              </Pressable>
            )}
          />
          <Button label={t.onboarding.close} variant="ghost" onPress={close} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}
