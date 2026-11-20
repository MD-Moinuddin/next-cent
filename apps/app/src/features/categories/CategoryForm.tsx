import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { TextField } from "@/components/ui/TextField";
import { t } from "@/i18n/strings";
import { useTheme } from "@/theme/useTheme";

export const CATEGORY_COLORS = [
  "#2563EB",
  "#047857",
  "#B45309",
  "#B91C1C",
  "#7C3AED",
  "#DB2777",
  "#0E7490",
  "#4B5563",
] as const;
export const DEFAULT_ICON = "🗂️";

const schema = z.object({
  name: z.string().trim().min(1, "name_required").max(60, "name_too_long"),
  icon: z.string().trim().min(1, "required").max(16, "icon_too_long"),
  color: z.string().nullable(),
});
export type CategoryFormValues = z.infer<typeof schema>;

const messageFor = (code?: string) =>
  code && code in t.errors
    ? t.errors[code as keyof typeof t.errors]
    : code
      ? t.errors.generic
      : undefined;

export function CategoryForm({
  title,
  initial,
  busy,
  submitError,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial?: Partial<CategoryFormValues>;
  busy: boolean;
  submitError: string | null;
  onSubmit: (values: CategoryFormValues) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const { control, handleSubmit } = useForm<CategoryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? "",
      icon: initial?.icon ?? DEFAULT_ICON,
      color: initial?.color ?? null,
    },
  });
  return (
    <View style={{ gap: 12 }}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <TextField
            testID="category-name"
            label={t.categories.name}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            maxLength={80}
            error={messageFor(fieldState.error?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="icon"
        render={({ field, fieldState }) => (
          <TextField
            testID="category-icon"
            label={t.categories.icon}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            maxLength={16}
            error={messageFor(fieldState.error?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="color"
        render={({ field }) => (
          <View style={{ gap: 4 }}>
            <Text variant="label" tone="muted">
              {t.categories.color}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {CATEGORY_COLORS.map((c, i) => {
                const selected = field.value === c;
                return (
                  <Pressable
                    key={c}
                    testID={`category-color-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={t.categories.colorOption(i + 1)}
                    accessibilityState={{ selected }}
                    onPress={() => field.onChange(selected ? null : c)}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: c,
                      borderWidth: selected ? 3 : 1,
                      borderColor: selected ? colors.ink : colors.line,
                    }}
                  />
                );
              })}
            </View>
          </View>
        )}
      />
      {submitError ? (
        <Text
          tone="bad"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          {submitError}
        </Text>
      ) : null}
      <Button
        testID="category-save"
        label={t.common.save}
        loading={busy}
        onPress={() => void handleSubmit(onSubmit)()}
      />
      <Button
        testID="category-cancel"
        label={t.common.cancel}
        variant="ghost"
        disabled={busy}
        onPress={onCancel}
      />
    </View>
  );
}
