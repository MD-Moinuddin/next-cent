import {
  focusManager,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import type { AppStateStatus } from "react-native";
import {
  FOREGROUND_REFRESH_MS,
  refreshOnForeground,
  wireFocusToAppState,
} from "./online";

/** A minimal AppState stand-in that lets a test emit state changes. */
function fakeAppState() {
  const listeners = new Set<(s: AppStateStatus) => void>();
  return {
    addEventListener: (_type: "change", cb: (s: AppStateStatus) => void) => {
      listeners.add(cb);
      return { remove: () => listeners.delete(cb) };
    },
    emit: (s: AppStateStatus) => listeners.forEach((cb) => cb(s)),
    count: () => listeners.size,
  };
}

const flush = () => new Promise<void>((r) => setImmediate(r));

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  client.clear();
  focusManager.setFocused(undefined);
});

describe("wireFocusToAppState", () => {
  it("refetches active stale queries when the app returns to the foreground", async () => {
    const appState = fakeAppState();
    const cleanup = wireFocusToAppState(appState, "ios");
    client.mount();
    const queryFn = jest.fn(async () => "fresh");
    const observer = new QueryObserver(client, {
      queryKey: ["transactions", "list", {}],
      queryFn,
      staleTime: 0,
    });
    const unsubscribe = observer.subscribe(() => {});
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(1);

    appState.emit("background");
    expect(focusManager.isFocused()).toBe(false);
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(1);

    appState.emit("active");
    expect(focusManager.isFocused()).toBe(true);
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(2);

    unsubscribe();
    client.unmount();
    cleanup();
  });

  it("leaves the default browser focus handling alone on web", () => {
    const appState = fakeAppState();
    wireFocusToAppState(appState, "web");
    expect(appState.count()).toBe(0);
  });
});

describe("refreshOnForeground", () => {
  it("invalidates transactions and summary on foreground, at most once per 30 s", () => {
    const appState = fakeAppState();
    let now = 1_000_000;
    const spy = jest.spyOn(client, "invalidateQueries");
    const stop = refreshOnForeground(client, appState, () => now);

    appState.emit("active");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["transactions"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["summary"] });
    expect(spy).toHaveBeenCalledTimes(2);

    appState.emit("background");
    now += FOREGROUND_REFRESH_MS - 1;
    appState.emit("active"); // throttled
    expect(spy).toHaveBeenCalledTimes(2);

    now += 1;
    appState.emit("inactive"); // not a foreground event
    expect(spy).toHaveBeenCalledTimes(2);
    appState.emit("active");
    expect(spy).toHaveBeenCalledTimes(4);

    stop();
    now += FOREGROUND_REFRESH_MS;
    appState.emit("active");
    expect(spy).toHaveBeenCalledTimes(4);
    expect(FOREGROUND_REFRESH_MS).toBe(30_000);
  });
});
