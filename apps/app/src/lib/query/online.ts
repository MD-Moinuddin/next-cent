import NetInfo from "@react-native-community/netinfo";
import {
  focusManager,
  onlineManager,
  type QueryClient,
} from "@tanstack/react-query";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { queryClient, queryKeys } from "./queryClient";

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

/** The part of React Native's AppState used here (tests pass a fake). */
export interface AppStateLike {
  addEventListener(
    type: "change",
    listener: (state: AppStateStatus) => void,
  ): { remove(): void };
}

/**
 * Native apps have no window focus events, so TanStack's default focus detection never fires and
 * stale screens are not refreshed after the app comes back. Map AppState to focus instead. Web keeps
 * the default visibilitychange handling.
 */
export function wireFocusToAppState(
  appState: AppStateLike = AppState,
  os: string = Platform.OS,
): () => void {
  if (os === "web") return () => {};
  focusManager.setEventListener((handleFocus) => {
    const sub = appState.addEventListener("change", (s) =>
      handleFocus(s === "active"),
    );
    return () => sub.remove();
  });
  return () => focusManager.setFocused(undefined);
}

export const FOREGROUND_REFRESH_MS = 30_000;

/**
 * Re-reads transactions and summaries when the app returns to the foreground (entries made on another
 * device or by the recurring job), at most once every 30 seconds, even if they are not stale yet.
 */
export function refreshOnForeground(
  client: QueryClient,
  appState: AppStateLike = AppState,
  now: () => number = Date.now,
): () => void {
  let last = Number.NEGATIVE_INFINITY;
  const sub = appState.addEventListener("change", (s) => {
    if (s !== "active") return;
    const at = now();
    if (at - last < FOREGROUND_REFRESH_MS) return;
    last = at;
    void client.invalidateQueries({ queryKey: queryKeys.transactions });
    void client.invalidateQueries({ queryKey: ["summary"] });
  });
  return () => sub.remove();
}

if (Platform.OS !== "web") {
  wireFocusToAppState();
  refreshOnForeground(queryClient);
}
