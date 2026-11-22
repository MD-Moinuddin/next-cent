import { clerkErrorMessage } from "./clerkError";

it("prefers the long message of the first Clerk error", () => {
  expect(
    clerkErrorMessage({
      errors: [
        {
          message: "Password is too weak",
          longMessage: "Password has been found in an online data breach.",
        },
      ],
    }),
  ).toBe("Password has been found in an online data breach.");
});
it("falls back to the short message", () => {
  expect(clerkErrorMessage({ errors: [{ message: "Invalid code" }] })).toBe(
    "Invalid code",
  );
});
it("returns undefined for anything else", () => {
  expect(clerkErrorMessage(new Error("network"))).toBeUndefined();
  expect(clerkErrorMessage({ errors: [] })).toBeUndefined();
  expect(clerkErrorMessage(null)).toBeUndefined();
  expect(clerkErrorMessage({ errors: [{ message: "  " }] })).toBeUndefined();
});
