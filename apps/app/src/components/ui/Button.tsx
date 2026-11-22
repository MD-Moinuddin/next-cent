import { ActivityIndicator, Pressable } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { Text } from "./Text";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  testID,
}: Props) {
  const { colors, radius } = useTheme();
  const inactive = disabled || loading;
  const bg = variant === "primary" ? colors.brand : "transparent";
  const fg =
    variant === "primary"
      ? colors.brandInk
      : variant === "danger"
        ? colors.bad
        : colors.brand;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={!!inactive}
      onPress={() => {
        if (!inactive) onPress();
      }}
      style={{
        minHeight: 52,
        paddingHorizontal: 16,
        borderRadius: radius.lg,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        opacity: inactive ? 0.5 : 1,
        borderWidth: variant === "primary" ? 0 : 1,
        borderColor: colors.line,
        ...(variant === "primary"
          ? {
              shadowColor: colors.brand,
              shadowOpacity: 0.3,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 3,
            }
          : {}),
      }}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text variant="label" style={{ color: fg, fontSize: 16 }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
