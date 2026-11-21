import { Alert, Platform } from "react-native";
import { t } from "@/i18n/strings";

/** Explicit confirmation before a destructive action (native alert, `window.confirm` on web). */
export function confirmDestructive(message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert(message, undefined, [
      {
        text: t.settings.confirmCancel,
        style: "cancel",
        onPress: () => resolve(false),
      },
      {
        text: t.settings.confirmAction,
        style: "destructive",
        onPress: () => resolve(true),
      },
    ]),
  );
}
