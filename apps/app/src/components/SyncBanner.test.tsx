import {
  QueryClient,
  QueryClientProvider,
  type Mutation,
} from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "@/i18n/strings";
import { ApiError, NetworkError } from "@/lib/query/errors";
import { createQueryClient } from "@/lib/query/queryClient";
import { SyncBanner } from "./SyncBanner";

let client: QueryClient;
let behaviour: "fail-network" | "ok";
const ran: string[] = [];

const built: Mutation<unknown, Error, string>[] = [];
function submit(vars: string, failure: unknown) {
  const m = client.getMutationCache().build(client, {
    mutationKey: ["transactions", "put"],
    retry: false,
    mutationFn: async (v: string) => {
      if (behaviour === "fail-network") throw failure;
      ran.push(v);
    },
  });
  built.push(m as Mutation<unknown, Error, string>);
  return m.execute(vars).catch(() => undefined);
}

beforeEach(() => {
  client = createQueryClient();
  behaviour = "fail-network";
  ran.length = 0;
  built.length = 0;
});
afterEach(() => {
  client
    .getMutationCache()
    .getAll()
    .forEach((m) => m.destroy());
  client.clear();
});

const renderBanner = () =>
  render(
    <QueryClientProvider client={client}>
      <SyncBanner />
    </QueryClientProvider>,
  );

it("replays retryable failures sequentially in submittedAt order", async () => {
  await submit("first", new NetworkError(new Error("x")));
  await submit("second", new NetworkError(new Error("x")));
  const all = client.getMutationCache().getAll() as Mutation<
    unknown,
    Error,
    string
  >[];
  // Make cache order differ from submission order: "second" was submitted first.
  (all[0]!.state as { submittedAt: number }).submittedAt = 2000;
  (all[1]!.state as { submittedAt: number }).submittedAt = 1000;
  await renderBanner();
  behaviour = "ok";
  const retry = await screen.findByRole("button", { name: "Retry" });
  await act(async () => {
    await fireEvent.press(retry);
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(ran).toEqual(["second", "first"]);
});

it("hides Retry for a 4xx failure and offers Discard only", async () => {
  await submit("bad", new ApiError(422, { code: "invalid_amount" }));
  await renderBanner();
  expect(
    await screen.findByText("1 change(s) could not be saved"),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
});

it("Discard removes the mutations and invalidates transactions and summary", async () => {
  await submit("bad", new ApiError(400));
  const spy = jest.spyOn(client, "invalidateQueries");
  await renderBanner();
  const discard = await screen.findByRole("button", { name: "Discard" });
  await act(async () => {
    await fireEvent.press(discard);
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(client.getMutationCache().getAll()).toHaveLength(0);
  expect(spy).toHaveBeenCalledWith({ queryKey: ["transactions"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["summary"] });
});

it("asks to sign in again for a 401 failure and keeps it retryable (no destructive default)", async () => {
  await submit("lapsed", new ApiError(401, { code: "invalid_token" }));
  await renderBanner();
  expect(await screen.findByText(t.sync.signInAgain)).toBeTruthy();
  // Honest about what is kept: in memory only, lost on restart or sign-out; Retry is the safe action.
  expect(t.sync.signInAgain).toMatch(/Retry/);
  expect(t.sync.signInAgain).toMatch(/only while the app stays open/);
  expect(t.sync.signInAgain).toMatch(
    /closing the app or signing out discards them/,
  );
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  expect(client.getMutationCache().getAll()).toHaveLength(1);
  behaviour = "ok";
  await act(async () => {
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(ran).toEqual(["lapsed"]);
});

it("shows the specific message for a mapped server code", async () => {
  await submit("archived", new ApiError(422, { code: "category_archived" }));
  await renderBanner();
  expect(await screen.findByText(t.errors.category_archived)).toBeTruthy();
  expect(screen.queryByText(t.sync.signInAgain)).toBeNull();
});
