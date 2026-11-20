import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { confirmIdentity, resetIdentity } from "./identity";
import { RequireIdentity } from "./RequireIdentity";
import { useSession } from "./session";

jest.mock("expo-router", () => {
  const { Text: MockText } = jest.requireActual("react-native");
  return {
    Redirect: ({ href }: { href: string }) => (
      <MockText>{`redirect:${href}`}</MockText>
    ),
  };
});
jest.mock("./session", () => ({ useSession: jest.fn() }));
const session = jest.mocked(useSession);
const tree = () => (
  <RequireIdentity>
    <Text>restored data</Text>
  </RequireIdentity>
);

afterEach(() => resetIdentity());

it("renders nothing until the identity is confirmed for this user", async () => {
  session.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: "u1",
  } as never);
  confirmIdentity("u0");
  await render(tree());
  expect(screen.toJSON()).toBeNull();
  await act(async () => confirmIdentity("u1"));
  expect(screen.getByText("restored data")).toBeOnTheScreen();
});

it("redirects to sign-in when signed out", async () => {
  session.mockReturnValue({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
  } as never);
  await render(tree());
  expect(screen.getByText("redirect:/sign-in")).toBeOnTheScreen();
});
