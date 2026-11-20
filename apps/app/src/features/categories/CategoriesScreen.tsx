import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { t } from "@/i18n/strings";
import { mutationMessage } from "@/lib/query/mutationError";
import type { CategoryOut } from "@/lib/types";
import { useTheme } from "@/theme/useTheme";
import { CategoryForm, type CategoryFormValues } from "./CategoryForm";
import { useCategories, useCreateCategory, usePatchCategory } from "./hooks";

type Editing = { kind: "new" } | { kind: "edit"; category: CategoryOut };

export function CategoriesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const categories = useCategories(true);
  const create = useCreateCategory();
  const patch = usePatchCategory();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const close = () => {
    setEditing(null);
    setFormError(null);
  };

  async function save(values: CategoryFormValues) {
    if (!editing) return;
    setFormError(null);
    try {
      if (editing.kind === "new") {
        await create.mutateAsync({
          name: values.name,
          icon: values.icon,
          ...(values.color ? { color: values.color } : {}),
        });
      } else {
        await patch.mutateAsync({
          id: editing.category.id,
          body: {
            name: values.name,
            icon: values.icon,
            color: values.color,
          },
        });
      }
      close();
    } catch (e) {
      setFormError(mutationMessage(e));
    }
  }

  async function setArchived(c: CategoryOut, archived: boolean) {
    setRowError(null);
    try {
      await patch.mutateAsync({ id: c.id, body: { archived } });
    } catch (e) {
      setRowError(mutationMessage(e));
    }
  }

  const all = categories.data ?? [];
  const active = all.filter((c) => !c.archived_at);
  const archived = all.filter((c) => c.archived_at);
  const busy = create.isPending || patch.isPending;

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
          {t.categories.title}
        </Text>
        <Button
          testID="category-new"
          label={`＋ ${t.categories.new}`}
          onPress={() => setEditing({ kind: "new" })}
        />
      </View>
      {rowError ? (
        <Text tone="bad" accessibilityRole="alert">
          {rowError}
        </Text>
      ) : null}
      {categories.isPending ? (
        <Text tone="muted">{t.common.loading}</Text>
      ) : null}
      {categories.isError && !categories.data ? (
        <View style={{ gap: 8 }}>
          <Text tone="bad" accessibilityRole="alert">
            {t.categories.loadError}
          </Text>
          <Button
            label={t.common.retry}
            onPress={() => void categories.refetch()}
          />
        </View>
      ) : null}
      {categories.data && all.length === 0 ? (
        <Text tone="muted">{t.categories.empty}</Text>
      ) : null}
      {active.map((c) => (
        <Row
          key={c.id}
          category={c}
          onEdit={() => setEditing({ kind: "edit", category: c })}
          onToggle={() => void setArchived(c, true)}
        />
      ))}
      {archived.length > 0 ? (
        <Text variant="label" tone="muted" accessibilityRole="header">
          {t.categories.archived}
        </Text>
      ) : null}
      {archived.map((c) => (
        <Row
          key={c.id}
          category={c}
          dimmed
          onEdit={() => setEditing({ kind: "edit", category: c })}
          onToggle={() => void setArchived(c, false)}
        />
      ))}
      <Button
        label={t.categories.back}
        variant="ghost"
        onPress={() => router.back()}
      />
      <Modal
        visible={editing !== null}
        animationType="slide"
        onRequestClose={close}
        accessibilityViewIsModal
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <ScrollView
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {editing ? (
              <CategoryForm
                title={
                  editing.kind === "new"
                    ? t.categories.newTitle
                    : t.categories.editTitle
                }
                initial={
                  editing.kind === "edit"
                    ? {
                        name: editing.category.name,
                        icon: editing.category.icon,
                        color: editing.category.color,
                      }
                    : undefined
                }
                busy={busy}
                submitError={formError}
                onSubmit={(v) => void save(v)}
                onCancel={close}
              />
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

function Row({
  category,
  dimmed,
  onEdit,
  onToggle,
}: {
  category: CategoryOut;
  dimmed?: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <Card
      testID={`category-row-${category.id}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <Text style={{ flex: 1 }}>{`${category.icon} ${category.name}`}</Text>
      <Button
        label={`${t.categories.edit} ${category.name}`}
        variant="ghost"
        onPress={onEdit}
      />
      <Button
        testID={`category-toggle-${category.id}`}
        label={`${dimmed ? t.categories.restore : t.categories.archive} ${category.name}`}
        variant="ghost"
        onPress={onToggle}
      />
    </Card>
  );
}
