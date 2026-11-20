import { currencySymbol, formatMoney } from "./format";

it("formats minor units with the currency exponent", () => {
  expect(formatMoney(1450, "EUR", "en-US")).toBe("€14.50");
  expect(formatMoney(1000, "JPY", "en-US")).toBe("¥1,000");
});
it("returns the currency symbol", () => {
  expect(currencySymbol("USD", "en-US")).toBe("$");
  expect(currencySymbol("EUR", "en-US")).toBe("€");
});
