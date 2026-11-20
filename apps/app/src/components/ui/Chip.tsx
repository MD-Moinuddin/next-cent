import { Pressable } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { Text } from "./Text";

export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        justifyContent: "center",
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.brand : colors.chip,
      }}
    >
      <Text
        variant="caption"
        style={{ color: selected ? colors.brandInk : colors.ink }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
