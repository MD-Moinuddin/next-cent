import { currencySymbol, formatMoney } from "./format";

it("formats minor units with the currency exponent", () => {
  expect(formatMoney(1450, "EUR", "en-US")).toBe("€14.50");
  expect(formatMoney(1000, "JPY", "en-US")).toBe("¥1,000");
});
it("returns the currency symbol", () => {
  expect(currencySymbol("USD", "en-US")).toBe("$");
  expect(currencySymbol("EUR", "en-US")).toBe("€");
});
describe("on engines without Intl.NumberFormat formatToParts", () => {
  const proto = Intl.NumberFormat.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, "formatToParts");

  beforeEach(() => {
    Object.defineProperty(proto, "formatToParts", {
      value: undefined,
      configurable: true,
    });
  });
  afterEach(() => {
    if (original) Object.defineProperty(proto, "formatToParts", original);
  });

  it("still returns the currency symbol", () => {
    expect(currencySymbol("USD", "en-US")).toBe("$");
    expect(currencySymbol("EUR", "en-US")).toBe("€");
    expect(currencySymbol("JPY", "en-US")).toBe("¥");
  });
  it("handles a symbol placed after the amount", () => {
    expect(currencySymbol("EUR", "de-DE")).toBe("€");
  });
});
