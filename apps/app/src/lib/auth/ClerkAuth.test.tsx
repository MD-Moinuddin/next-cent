import { useEffect } from "react";
import { act, render } from "@testing-library/react-native";
import { AuthProvider } from "./ClerkAuth";
import { useSession, type SessionApi } from "./session";

const mockClear = jest.fn(async () => {});
const mockSetTokenGetter = jest.fn();
const mockAuth = {
  isLoaded: true,
  isSignedIn: true as boolean,
  userId: "u1" as string | null,
  getToken: jest.fn(async () => "tok"),
  signOut: jest.fn(async () => {}),
};
const userDelete = jest.fn(async () => {});
let mockUser: { id: string; delete: () => Promise<void> } | null = null;

jest.mock("@clerk/expo", () => ({
  ClerkProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => mockAuth,
  useUser: () => ({ user: mockUser }),
}));
jest.mock("@/lib/query/clear", () => ({ clearLocalData: () => mockClear() }));
jest.mock("@/lib/api", () => ({
  setTokenGetter: (fn: unknown) => mockSetTokenGetter(fn),
}));

const sessionRef: { current: SessionApi | null } = { current: null };
const session = () => sessionRef.current!;
function Probe() {
  const value = useSession();
  useEffect(() => {
    sessionRef.current = value;
  });
  return null;
}
const tree = () => (
  <AuthProvider>
    <Probe />
  </AuthProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockAuth, { isLoaded: true, isSignedIn: true, userId: "u1" });
  mockUser = { id: "u1", delete: userDelete };
});

it("does not clear on the first sign-in (no previous identity)", async () => {
  Object.assign(mockAuth, { isLoaded: false, isSignedIn: false, userId: null });
  const view = await render(tree());
  Object.assign(mockAuth, { isLoaded: true, isSignedIn: true, userId: "u1" });
  await view.rerender(tree());
  expect(mockClear).not.toHaveBeenCalled();
});

it("clears when isSignedIn goes true -> false", async () => {
  const view = await render(tree());
  expect(mockClear).not.toHaveBeenCalled();
  Object.assign(mockAuth, { isSignedIn: false, userId: null });
  await view.rerender(tree());
  expect(mockClear).toHaveBeenCalledTimes(1);
});

it("clears when the user id changes from one user to another", async () => {
  const view = await render(tree());
  Object.assign(mockAuth, { userId: "u2" });
  await view.rerender(tree());
  expect(mockClear).toHaveBeenCalledTimes(1);
  await view.rerender(tree()); // same identity again: idempotent, no second clear
  expect(mockClear).toHaveBeenCalledTimes(1);
});

it("signOut wrapper signs out, then clears local data", async () => {
  await render(tree());
  const order: string[] = [];
  mockAuth.signOut.mockImplementationOnce(async () => void order.push("clerk"));
  mockClear.mockImplementationOnce(async () => void order.push("clear"));
  await act(async () => {
    await session().signOut();
  });
  expect(order).toEqual(["clerk", "clear"]);
});

it("deleteAuthAccount deletes the user, then clears local data", async () => {
  await render(tree());
  await act(async () => {
    await session().deleteAuthAccount();
  });
  expect(userDelete).toHaveBeenCalledTimes(1);
  expect(mockClear).toHaveBeenCalledTimes(1);
});

it("deleteAuthAccount throws without a user and does not clear", async () => {
  mockUser = null;
  await render(tree());
  await expect(session().deleteAuthAccount()).rejects.toThrow(
    "No signed-in user",
  );
  expect(mockClear).not.toHaveBeenCalled();
});

it("installs the token getter before children effects run and delegates to the latest getToken", async () => {
  await render(tree());
  expect(mockSetTokenGetter).toHaveBeenCalled();
  const fn = mockSetTokenGetter.mock.calls[0]![0] as () => Promise<
    string | null
  >;
  await expect(fn()).resolves.toBe("tok");
});
