import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Mutation } from "@tanstack/react-query";
import { PERSIST_KEY, persister, shouldPersistMutation } from "./persist";

const mutation = (state: object, key: string[]) =>
  ({ state, options: { mutationKey: key } }) as unknown as Mutation;

it("persists paused writes and pending transaction writes only", () => {
  const tx = ["transactions", "put"];
  expect(
    shouldPersistMutation(mutation({ isPaused: true, status: "pending" }, tx)),
  ).toBe(true);
  // waiting for a confirmed identity, backing off or in flight: kept so killing the app loses nothing
  expect(
    shouldPersistMutation(mutation({ isPaused: false, status: "pending" }, tx)),
  ).toBe(true);
  expect(
    shouldPersistMutation(mutation({ isPaused: false, status: "success" }, tx)),
  ).toBe(false);
  expect(
    shouldPersistMutation(mutation({ isPaused: false, status: "error" }, tx)),
  ).toBe(false);
  // online-only mutations (categories, profile, ...) are never persisted while running
  expect(
    shouldPersistMutation(
      mutation({ isPaused: false, status: "pending" }, ["categories"]),
    ),
  ).toBe(false);
});

it("restores a pending write as paused so it resumes after the identity check", async () => {
  await AsyncStorage.setItem(
    PERSIST_KEY,
    JSON.stringify({
      timestamp: 1,
      buster: "1",
      clientState: {
        queries: [],
        mutations: [
          {
            mutationKey: ["transactions", "put"],
            state: { status: "pending", isPaused: false },
          },
          {
            mutationKey: ["transactions", "put"],
            state: { status: "pending", isPaused: true },
          },
        ],
      },
    }),
  );
  const restored = await persister.restoreClient();
  expect(restored?.clientState.mutations.map((m) => m.state.isPaused)).toEqual([
    true,
    true,
  ]);
  await AsyncStorage.clear();
});
