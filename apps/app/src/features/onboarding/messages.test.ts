import { t } from "@/i18n/strings";
import { ApiError, NetworkError } from "@/lib/query/errors";
import { saveError } from "./messages";

it("shows the offline text for network failures and mapped texts for api codes", () => {
  expect(saveError(new NetworkError(new Error("x")))).toBe(
    t.common.offlineOnly,
  );
  expect(saveError(new ApiError(409, { code: "currency_locked" }))).toBe(
    t.errors.currency_locked,
  );
  expect(saveError(new Error("x"))).toBe(t.errors.generic);
});
