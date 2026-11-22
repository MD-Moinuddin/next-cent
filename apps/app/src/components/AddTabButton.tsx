import { Ionicons } from "@expo/vector-icons";
import { Pressable, View, type GestureResponderEvent } from "react-native";
import { t } from "@/i18n/strings";
import { useTheme } from "@/theme/useTheme";

// The centre "Add" tab: a raised Sky circle with a soft glow. In the wide (side) layout it stays inline.
export function AddTabButton({
  onPress,
  testID,
  raised,
}: {
  onPress?: (e: GestureResponderEvent) => void;
  testID?: string;
  raised: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={t.tabs.add}
      onPress={onPress}
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          marginTop: raised ? -22 : 0,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.accent,
          borderWidth: 4,
          borderColor: colors.card,
          shadowColor: colors.accent,
          shadowOpacity: 0.45,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <Ionicons name="add" size={30} color={colors.accentInk} />
      </View>
    </Pressable>
  );
}
