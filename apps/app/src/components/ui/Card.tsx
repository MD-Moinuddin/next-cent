import { View, type ViewProps } from "react-native";
import { shadow } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export function Card({ style, ...rest }: ViewProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.line,
          padding: spacing.lg,
          ...shadow.card,
        },
        style,
      ]}
    />
  );
}
