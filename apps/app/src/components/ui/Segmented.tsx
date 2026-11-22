import { Pressable, View } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { Text } from "./Text";

type Option<T extends string> = { value: T; label: string; testID?: string };

/** A two-or-three option switch in one rounded track (for example Expense / Income). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        padding: 4,
        borderRadius: radius.lg,
        backgroundColor: colors.chip,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={o.testID}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.md,
              backgroundColor: selected ? colors.card : "transparent",
            }}
          >
            <Text
              variant="body"
              style={{
                fontWeight: selected ? "700" : "500",
                color: selected ? colors.ink : colors.chipInk,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
