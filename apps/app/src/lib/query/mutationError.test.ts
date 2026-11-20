import { t } from "@/i18n/strings";
import { ApiError, NetworkError } from "./errors";
import { mutationMessage } from "./mutationError";

it("maps network failures to the offline text", () => {
  expect(mutationMessage(new NetworkError(new Error("x")))).toBe(
    t.common.offlineOnly,
  );
});
it("maps known api codes", () => {
  expect(mutationMessage(new ApiError(409, { code: "category_exists" }))).toBe(
    t.errors.category_exists,
  );
  expect(mutationMessage(new ApiError(409, { code: "currency_locked" }))).toBe(
    t.errors.currency_locked,
  );
});
it("falls back to the generic text", () => {
  expect(mutationMessage(new ApiError(500, { code: "boom" }))).toBe(
    t.errors.generic,
  );
  expect(mutationMessage(new Error("x"))).toBe(t.errors.generic);
});

it.each([
  "transaction_deleted",
  "category_archived",
  "invalid_category",
  "rate_limited",
  "payload_too_large",
  "too_many_rules",
  "anchor_out_of_range",
] as const)("maps the server code %s", (code) => {
  expect(mutationMessage(new ApiError(409, { code }))).toBe(t.errors[code]);
  expect(t.errors[code]).not.toBe(t.errors.generic);
});
