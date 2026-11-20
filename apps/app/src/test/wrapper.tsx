import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { createQueryClient } from "@/lib/query/queryClient";

export function createTestClient(): QueryClient {
  const client = createQueryClient();
  client.setDefaultOptions({
    queries: { retry: false, gcTime: Infinity, staleTime: 30_000 },
    mutations: { gcTime: Infinity },
  });
  return client;
}

export function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

/** Query client plus the toast provider, for screens that show toasts. */
export function appWrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

/** Destroys mutations (their gc timers) and clears the client so Jest can exit. */
export function disposeClient(client: QueryClient): void {
  client
    .getMutationCache()
    .getAll()
    .forEach((m) => m.destroy());
  client.clear();
}

/**
 * Flushes pending promise callbacks inside act. React Native's Jest setup replaces Promise with a
 * polyfill whose every `.then` hop is a macrotask, so a long chain (react-hook-form's async submit)
 * needs many turns; drain them in bulk instead of sleeping on a timer.
 */
export const settle = () =>
  act(async () => {
    for (let i = 0; i < 50; i++)
      await new Promise<void>((resolve) => setImmediate(resolve));
  });

/**
 * Presses a control whose handler finishes asynchronously (form submit) and drains it, all inside ONE
 * act scope: with the slow Promise polyfill there is otherwise a gap between two act scopes in which
 * the submit's state updates land un-acted.
 */
export const pressAndSettle = (
  element: Parameters<typeof fireEvent.press>[0],
) =>
  act(async () => {
    await fireEvent.press(element);
    for (let i = 0; i < 50; i++)
      await new Promise<void>((resolve) => setImmediate(resolve));
  });
