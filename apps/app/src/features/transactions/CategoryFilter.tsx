import { useState } from "react";
import { FlatList, Modal, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Text } from "@/components/ui/Text";
import { useCategories } from "@/features/categories/hooks";
import { t } from "@/i18n/strings";
import { slug } from "@/lib/slug";
import { useTheme } from "@/theme/useTheme";

/** A chip showing the selected category that opens a picker of all active categories. */
export function CategoryFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  const { colors } = useTheme();
  const categories = useCategories();
  const [open, setOpen] = useState(false);
  const selected = categories.data?.find((c) => c.id === value);
  const options = (categories.data ?? []).filter((c) => !c.archived_at);
  const rows = [
    { id: "", name: t.transactions.allCategories, icon: "" },
    ...options,
  ];
  return (
    <>
      <Chip
        testID="filter-category"
        label={`${selected ? selected.name : t.transactions.category} ▾`}
        selected={!!value}
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        accessibilityViewIsModal
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 }}
        >
          <Text variant="title" accessibilityRole="header">
            {t.transactions.chooseCategory}
          </Text>
          <FlatList
            data={rows}
            keyExtractor={(c) => c.id || "all"}
            renderItem={({ item }) => (
              <Pressable
                testID={`filter-category-${item.id ? slug(item.name) : "all"}`}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                accessibilityState={{ selected: (value ?? "") === item.id }}
                onPress={() => {
                  onChange(item.id || undefined);
                  setOpen(false);
                }}
                style={{
                  minHeight: 48,
                  justifyContent: "center",
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <Text>{`${item.icon} ${item.name}`.trim()}</Text>
              </Pressable>
            )}
          />
          <Button
            label={t.transactions.close}
            variant="ghost"
            onPress={() => setOpen(false)}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
