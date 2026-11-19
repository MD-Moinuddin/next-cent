import { describe, expect, it } from "vitest";
import { onboardingSchema, toMePatch } from "./onboarding";

describe("onboarding schema", () => {
  it("accepts valid amounts and omits empty ones", () => {
    const v = onboardingSchema.parse({
      currency: "EUR",
      openingBalance: "1250.00",
      monthlyIncome: "",
    });
    expect(toMePatch(v, { completeOnboarding: true })).toEqual({
      home_currency: "EUR",
      opening_balance_minor: 125000,
      onboarding_completed: true,
    });
  });
  it("omits a zero income", () => {
    const v = onboardingSchema.parse({ currency: "USD", monthlyIncome: "0" });
    expect(toMePatch(v)).toEqual({ home_currency: "USD" });
  });
  it("reports money error codes per field", () => {
    const r = onboardingSchema.safeParse({
      currency: "EUR",
      openingBalance: "1.234",
      monthlyIncome: "abc",
    });
    expect(r.success).toBe(false);
    const issues = r.error!.issues.map((i) => [i.path[0], i.message]);
    expect(issues).toContainEqual(["openingBalance", "too_many_decimals"]);
    expect(issues).toContainEqual(["monthlyIncome", "invalid_amount"]);
  });
  it("rejects unsupported currencies", () => {
    expect(onboardingSchema.safeParse({ currency: "XXX" }).success).toBe(false);
  });
});

describe("onboarding schema prototype keys", () => {
  it("rejects prototype-key currencies", () => {
    for (const currency of ["constructor", "toString", "__proto__"]) {
      const r = onboardingSchema.safeParse({ currency, openingBalance: "1" });
      expect(r.success, currency).toBe(false);
    }
  });
});
