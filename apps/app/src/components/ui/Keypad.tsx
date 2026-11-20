import { useEffect, useRef } from "react";
import { Platform, Pressable, View } from "react-native";
import { t } from "@/i18n/strings";
import { useTheme } from "@/theme/useTheme";
import { Text } from "./Text";

export type KeypadKey =
  "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "back";

/** Maps a physical keyboard `KeyboardEvent.key` to a keypad key, or null when it is not one. */
export function mapKeyboardKey(key: string): KeypadKey | null {
  if (/^[0-9]$/.test(key)) return key as KeypadKey;
  if (key === "." || key === ",") return ".";
  if (key === "Backspace") return "back";
  return null;
}

interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}
interface EventTargetLike {
  addEventListener?: (type: "keydown", fn: (e: KeyEventLike) => void) => void;
  removeEventListener?: (
    type: "keydown",
    fn: (e: KeyEventLike) => void,
  ) => void;
}

const ROWS: KeypadKey[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "back"],
];

export function Keypad({
  onKey,
  allowDot = true,
}: {
  onKey: (key: KeypadKey) => void;
  allowDot?: boolean;
}) {
  const { colors, radius } = useTheme();
  const handler = useRef(onKey);
  useEffect(() => {
    handler.current = onKey;
  });

  // Physical keyboard support on web only (digits, "." or "," and Backspace).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const target = globalThis as unknown as EventTargetLike;
    if (!target.addEventListener || !target.removeEventListener) return;
    const listener = (e: KeyEventLike) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable)
        return; // typing in a text field
      const mapped = mapKeyboardKey(e.key);
      if (mapped) handler.current(mapped);
    };
    target.addEventListener("keydown", listener);
    return () => target.removeEventListener?.("keydown", listener);
  }, []);

  const label = (k: KeypadKey) =>
    k === "." ? t.keypad.dot : k === "back" ? t.keypad.backspace : k;
  const testID = (k: KeypadKey) =>
    k === "." ? "key-dot" : k === "back" ? "key-back" : `key-${k}`;

  return (
    <View style={{ gap: 8 }}>
      {ROWS.map((row) => (
        <View key={row.join("")} style={{ flexDirection: "row", gap: 8 }}>
          {row.map((k) => {
            const disabled = k === "." && !allowDot;
            return (
              <Pressable
                key={k}
                testID={testID(k)}
                accessibilityRole="button"
                accessibilityLabel={label(k)}
                accessibilityState={{ disabled }}
                onPress={() => {
                  if (!disabled) onKey(k);
                }}
                style={{
                  flex: 1,
                  height: 56,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: radius.md,
                  backgroundColor: colors.chip,
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <Text variant="title">
                  {k === "back" ? "⌫" : k === "." ? "." : k}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
