import { fitToCurrency, normalizeAmount, pressKey } from "./amountInput";

const type = (keys: string[], currency = "EUR") =>
  keys.reduce((acc, k) => pressKey(acc, k, currency), "");

it("builds amounts digit by digit", () => {
  expect(type(["1", "4", ".", "5", "0"])).toBe("14.50");
});
it("limits decimals to the currency exponent", () => {
  expect(type(["1", ".", "5", "0", "9"])).toBe("1.50");
  expect(type(["1", "2", ".", "5"], "JPY")).toBe("12");
  expect(type(["1", ".", "2", "3", "4", "5"], "KWD")).toBe("1.234");
});
it("handles leading zeros, a lone dot and a single dot only", () => {
  expect(type(["0", "0", "7"])).toBe("7");
  expect(type(["."])).toBe("0.");
  expect(type(["1", ".", ".", "2"])).toBe("1.2");
  expect(type(["0", ".", "0", "5"])).toBe("0.05");
});
it("supports backspace down to empty", () => {
  expect(type(["1", "2", "back"])).toBe("1");
  expect(type(["back"])).toBe("");
  expect(type(["1", ".", "back"])).toBe("1");
});
it("ignores unknown keys", () => {
  expect(type(["1", "x", "-"])).toBe("1");
});
it("ignores digits that would exceed the maximum amount", () => {
  const nines = Array(20).fill("9") as string[];
  const result = type(nines);
  expect(Number(result)).toBeLessThanOrEqual(10_000_000_000);
  expect(result).toBe("9999999999");
});

describe("fitToCurrency", () => {
  it("truncates extra decimals and dangling dots when the currency changes", () => {
    expect(fitToCurrency("14.50", "JPY")).toBe("14");
    expect(fitToCurrency("14.", "JPY")).toBe("14");
    expect(fitToCurrency("1.234", "EUR")).toBe("1.23");
    expect(fitToCurrency("1.234", "KWD")).toBe("1.234");
    expect(fitToCurrency("", "EUR")).toBe("");
  });
});

describe("normalizeAmount", () => {
  it("drops a trailing dot and trims", () => {
    expect(normalizeAmount("5.")).toBe("5");
    expect(normalizeAmount(" 14.50 ")).toBe("14.50");
    expect(normalizeAmount("0.")).toBe("0");
    expect(normalizeAmount("")).toBe("");
    expect(normalizeAmount("1.5")).toBe("1.5");
  });
});
