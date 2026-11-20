import { currencyName, currencyOptions } from "./currencies";

it("filters by code or name", () => {
  expect(currencyOptions("en-US", "eur").map((o) => o.code)).toContain("EUR");
  expect(currencyOptions("en-US", "zzzz")).toEqual([]);
  expect(currencyOptions("en-US").length).toBeGreaterThan(10);
});

it("falls back to the code without Intl.DisplayNames", () => {
  const original = Intl.DisplayNames;
  const set = (value: unknown) =>
    Object.defineProperty(Intl, "DisplayNames", { value, configurable: true });
  set(undefined);
  try {
    expect(currencyName("EUR", "en-US")).toBe("EUR");
  } finally {
    set(original);
  }
});
