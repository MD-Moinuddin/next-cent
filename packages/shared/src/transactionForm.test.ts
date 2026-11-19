import { describe, expect, it } from "vitest";
import { toTransactionBody, transactionFormSchema } from "./transactionForm";

const base = {
  kind: "expense",
  amount: "14.50",
  currency: "EUR",
  occurredOn: "2026-11-17",
  categoryId: "3f1b1a0e-6d1c-4c58-8c0e-0d7f5d5f4b11",
  merchant: " Lidl ",
  note: "",
  tags: ["weekly"],
} as const;

describe("transaction form", () => {
  it("converts to an API body with integer minor units", () => {
    const v = transactionFormSchema.parse(base);
    expect(toTransactionBody(v)).toEqual({
      kind: "expense",
      amount_minor: 1450,
      currency: "EUR",
      occurred_on: "2026-11-17",
      category_id: base.categoryId,
      merchant: "Lidl",
      note: null,
      tags: ["weekly"],
      base_version: undefined,
    });
    expect(toTransactionBody(v, 3).base_version).toBe(3);
  });
  it("requires a category for expenses but not income", () => {
    expect(
      transactionFormSchema.safeParse({ ...base, categoryId: null }).success,
    ).toBe(false);
    expect(
      transactionFormSchema.safeParse({
        ...base,
        kind: "income",
        categoryId: null,
      }).success,
    ).toBe(true);
  });
  it("rejects zero, malformed and over-precise amounts and bad dates", () => {
    for (const amount of ["0", "0.00", "", "abc", "1.234"]) {
      expect(
        transactionFormSchema.safeParse({ ...base, amount }).success,
        amount,
      ).toBe(false);
    }
    expect(
      transactionFormSchema.safeParse({ ...base, occurredOn: "17.11.2026" })
        .success,
    ).toBe(false);
    expect(
      transactionFormSchema.safeParse({ ...base, occurredOn: "2026-02-31" })
        .success,
    ).toBe(false);
  });
  it("sends no category for income", () => {
    const v = transactionFormSchema.parse({ ...base, kind: "income" });
    expect(toTransactionBody(v).category_id).toBeNull();
  });
  it("rejects prototype-key currencies without throwing", () => {
    for (const currency of ["constructor", "toString", "__proto__"]) {
      const r = transactionFormSchema.safeParse({ ...base, currency });
      expect(r.success, currency).toBe(false);
    }
  });

  it("mirrors the server date range 2000-01-01..2100-12-31", () => {
    const ok = (occurredOn: string) =>
      transactionFormSchema.safeParse({ ...base, occurredOn }).success;
    expect(ok("1999-12-31")).toBe(false);
    expect(ok("2000-01-01")).toBe(true);
    expect(ok("2100-12-31")).toBe(true);
    expect(ok("2101-01-01")).toBe(false);
  });
  it("reports a specific code per length limit", () => {
    const code = (over: object) => {
      const r = transactionFormSchema.safeParse({ ...base, ...over });
      return r.success ? null : r.error.issues[0]!.message;
    };
    expect(code({ merchant: "m".repeat(120) })).toBeNull();
    expect(code({ merchant: "m".repeat(121) })).toBe("merchant_too_long");
    expect(code({ note: "n".repeat(500) })).toBeNull();
    expect(code({ note: "n".repeat(501) })).toBe("note_too_long");
    expect(code({ tags: ["t".repeat(30)] })).toBeNull();
    expect(code({ tags: ["t".repeat(31)] })).toBe("tag_too_long");
    expect(code({ tags: [" "] })).toBe("tag_invalid");
    expect(
      code({ tags: Array.from({ length: 20 }, (_, i) => `t${i}`) }),
    ).toBeNull();
    expect(code({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) })).toBe(
      "too_many_tags",
    );
    expect(code({ occurredOn: "2101-01-01" })).toBe("date_out_of_range");
    expect(code({ occurredOn: "17.11.2026" })).toBe("invalid_date");
  });
  it("dedupes tags case-insensitively, keeping the first spelling", () => {
    const v = transactionFormSchema.parse({
      ...base,
      tags: ["Weekly", "weekly", "Food", "WEEKLY", "food"],
    });
    expect(toTransactionBody(v).tags).toEqual(["Weekly", "Food"]);
  });
});
