import { TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { Text } from "./Text";

export function TextField({
  label,
  error,
  ...rest
}: TextInputProps & { label: string; error?: string }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...rest}
        style={{
          minHeight: 48,
          borderWidth: 1,
          borderColor: error ? colors.bad : colors.line,
          borderRadius: radius.md,
          paddingHorizontal: 12,
          color: colors.ink,
          backgroundColor: colors.card,
          fontSize: 16,
        }}
      />
      {error ? (
        <Text variant="caption" tone="bad" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
