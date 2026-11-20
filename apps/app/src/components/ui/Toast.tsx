import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme/useTheme";
import { Text } from "./Text";

export const TOAST_DURATION_MS = 5000;

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}
const ToastContext = createContext<{ show(o: ToastOptions): void } | null>(
  null,
);
export const useToast = () => {
  const c = useContext(ToastContext);
  if (!c) throw new Error("ToastProvider missing");
  return c;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const { radius } = useTheme();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((o: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(o);
    timer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View
          testID="toast"
          accessibilityLiveRegion="polite"
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 96,
            backgroundColor: "#111827",
            borderRadius: radius.md,
            padding: 14,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            maxWidth: 520,
            alignSelf: "center",
          }}
        >
          <Text style={{ color: "#fff", flexShrink: 1 }}>{toast.message}</Text>
          {toast.actionLabel ? (
            <Pressable
              testID="toast-action"
              accessibilityRole="button"
              onPress={() => {
                toast.onAction?.();
                setToast(null);
              }}
              style={{
                minHeight: 44,
                minWidth: 44,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text variant="label" style={{ color: "#93C5FD" }}>
                {toast.actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}
