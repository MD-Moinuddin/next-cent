import { ApiError, NetworkError } from "@/lib/query/errors";
import { t } from "@/i18n/strings";
import { apiErrorKey } from "./errorKey";

it("maps a version conflict to its own key", () => {
  expect(apiErrorKey(new ApiError(409, { code: "version_conflict" }))).toBe(
    "version_conflict",
  );
});
it("maps known codes and falls back to generic", () => {
  expect(apiErrorKey(new ApiError(409, { code: "category_exists" }))).toBe(
    "category_exists",
  );
  expect(apiErrorKey(new ApiError(500))).toBe("generic");
  expect(apiErrorKey(new ApiError(422, { code: "something_new" }))).toBe(
    "generic",
  );
  expect(apiErrorKey(new NetworkError(new Error("x")))).toBe("generic");
  expect(apiErrorKey(undefined)).toBe("generic");
});

it.each([
  "transaction_deleted",
  "category_archived",
  "invalid_category",
  "rate_limited",
  "payload_too_large",
  "too_many_rules",
  "anchor_out_of_range",
] as const)("maps the server code %s to its own message", (code) => {
  expect(apiErrorKey(new ApiError(409, { code }))).toBe(code);
  expect(t.errors[code]).toEqual(expect.any(String));
  expect(t.errors[code]).not.toBe(t.errors.generic);
});
