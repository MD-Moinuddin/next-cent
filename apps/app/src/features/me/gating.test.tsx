import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useMe } from "@/features/me/hooks";
import { confirmIdentity, resetIdentity } from "@/lib/auth/identity";
import { useSession } from "@/lib/auth/session";
import { Text as MockText } from "react-native";
import AppLayout from "@/app/(app)/_layout";

jest.mock("expo-router", () => ({
  Tabs: Object.assign(() => <MockText>tabs</MockText>, { Screen: () => null }),
  Redirect: ({ href }: { href: string }) => (
    <MockText>{`redirect:${href}`}</MockText>
  ),
  usePathname: () => mockPathname,
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/auth/session", () => ({ useSession: jest.fn() }));
jest.mock("@/features/me/hooks", () => ({ useMe: jest.fn() }));
let mockPathname = "/";
const session = jest.mocked(useSession);
const me = jest.mocked(useMe);
const result = (v: object) => me.mockReturnValue(v as never);

beforeEach(() => {
  mockPathname = "/";
  session.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: "u1",
  } as never);
  // The layout renders only for a confirmed identity (see the identity tests at the end).
  confirmIdentity("u1");
});
afterEach(() => resetIdentity());

it("redirects to onboarding when it is incomplete", async () => {
  result({ data: { onboarding_completed: false } });
  await render(<AppLayout />);
  expect(screen.getByText("redirect:/onboarding")).toBeOnTheScreen();
});

it("does not redirect loop while already on onboarding", async () => {
  mockPathname = "/onboarding";
  result({ data: { onboarding_completed: false } });
  await render(<AppLayout />);
  expect(screen.queryByText(/redirect/)).toBeNull();
});

it("renders nothing while loading with no cached data", async () => {
  result({ data: undefined, isError: false });
  await render(<AppLayout />);
  expect(screen.toJSON()).toBeNull();
});

it("shows an error with Retry when getMe fails", async () => {
  const refetch = jest.fn();
  result({ data: undefined, isError: true, refetch });
  await render(<AppLayout />);
  expect(screen.getByRole("alert")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(refetch).toHaveBeenCalled();
});

it("only fetches me when signed in", async () => {
  session.mockReturnValue({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
  } as never);
  result({ data: undefined, isError: false });
  await render(<AppLayout />);
  expect(me).toHaveBeenCalledWith(false);
  expect(screen.getByText("redirect:/sign-in")).toBeOnTheScreen();
});

it("renders the tabs once onboarded", async () => {
  result({ data: { onboarding_completed: true } });
  await render(<AppLayout />);
  expect(screen.getByText(/tabs/)).toBeOnTheScreen();
});

describe("identity binding", () => {
  it("does not render restored data before the identity is confirmed", async () => {
    resetIdentity();
    result({ data: { onboarding_completed: true }, isError: false });
    await render(<AppLayout />);
    expect(screen.toJSON()).toBeNull();
    expect(me).toHaveBeenLastCalledWith(false); // no fetch with an unconfirmed identity either
    await act(async () => confirmIdentity("u1"));
    expect(screen.getByText(/tabs/)).toBeOnTheScreen();
    expect(me).toHaveBeenLastCalledWith(true);
  });

  it("does not render while the confirmed identity belongs to another user", async () => {
    resetIdentity();
    confirmIdentity("u2"); // still the previous user while the switch is being reconciled
    result({ data: { onboarding_completed: true }, isError: false });
    await render(<AppLayout />);
    expect(screen.toJSON()).toBeNull();
    expect(me).toHaveBeenLastCalledWith(false);
  });
});
