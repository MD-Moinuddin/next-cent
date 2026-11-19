import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CURRENCY_EXPONENTS,
  MAX_AMOUNT_MINOR,
  MoneyError,
  type MoneyErrorCode,
  formatAmount,
  getExponent,
  minorToDecimalString,
  parseAmount,
} from "./money";

interface MoneyVectors {
  valid: { input: string; currency: string; minor: number; decimal: string }[];
  invalid: { input: string; currency: string; code: MoneyErrorCode }[];
}

const contract = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../contracts/${name}`, import.meta.url)),
      "utf8",
    ),
  );

describe("currency table", () => {
  it("matches contracts/currencies.json exactly", () => {
    expect(CURRENCY_EXPONENTS).toEqual(contract("currencies.json"));
  });
  it("rejects unknown currencies", () => {
    expect(() => getExponent("XXX")).toThrowError(MoneyError);
  });
});

describe("parseAmount and minorToDecimalString (shared vectors)", () => {
  const vectors = contract("money-vectors.json") as MoneyVectors;
  it.each(vectors.valid)(
    "parses $input $currency",
    ({ input, currency, minor, decimal }) => {
      expect(parseAmount(input, currency)).toBe(minor);
      expect(minorToDecimalString(minor, currency)).toBe(decimal);
    },
  );
  it.each(vectors.invalid)(
    "rejects $input $currency with $code",
    ({ input, currency, code }) => {
      try {
        parseAmount(input, currency);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(MoneyError);
        expect((e as MoneyError).code).toBe(code);
      }
    },
  );
  it("never produces float drift", () => {
    expect(parseAmount("0.1", "USD") + parseAmount("0.2", "USD")).toBe(
      parseAmount("0.3", "USD"),
    );
  });
  it("has a safe maximum", () => {
    expect(Number.isSafeInteger(MAX_AMOUNT_MINOR)).toBe(true);
  });
});

describe("formatAmount", () => {
  it("formats using the currency exponent", () => {
    expect(formatAmount(1450, "EUR", "en-US")).toBe("€14.50");
    expect(formatAmount(1000, "JPY", "en-US")).toBe("¥1,000");
  });
});

describe("prototype keys are not currencies", () => {
  for (const key of [
    "constructor",
    "toString",
    "__proto__",
    "hasOwnProperty",
  ]) {
    it(`rejects ${key}`, () => {
      expect(() => getExponent(key)).toThrow(MoneyError);
      expect(() => parseAmount("1", key)).toThrow(MoneyError);
      try {
        getExponent(key);
      } catch (e) {
        expect((e as MoneyError).code).toBe("unsupported_currency");
      }
    });
  }
});
