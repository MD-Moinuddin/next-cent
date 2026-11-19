import { z } from "zod";
import { isSupportedCurrency, MoneyError, parseAmount } from "./money";

export const MIN_DATE = "2000-01-01";
export const MAX_DATE = "2100-12-31";

const isRealDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
};

export const transactionFormSchema = z
  .object({
    kind: z.enum(["expense", "income"]),
    amount: z.string().trim().min(1, "required"),
    currency: z.string().refine(isSupportedCurrency, "unsupported_currency"),
    occurredOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
      .refine(isRealDate, "invalid_date")
      .refine((d) => d >= MIN_DATE && d <= MAX_DATE, "date_out_of_range"),
    categoryId: z.string().uuid().nullable(),
    merchant: z.string().max(120, "merchant_too_long").optional(),
    note: z.string().max(500, "note_too_long").optional(),
    tags: z
      .array(z.string().trim().min(1, "tag_invalid").max(30, "tag_too_long"))
      .max(20, "too_many_tags"),
  })
  .superRefine((v, ctx) => {
    if (isSupportedCurrency(v.currency)) {
      try {
        if (parseAmount(v.amount, v.currency) <= 0)
          ctx.addIssue({
            code: "custom",
            path: ["amount"],
            message: "invalid_amount",
          });
      } catch (e) {
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: e instanceof MoneyError ? e.code : "invalid_amount",
        });
      }
    }
    if (v.kind === "expense" && !v.categoryId)
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "required",
      });
  });

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export interface TransactionBody {
  kind: "expense" | "income";
  amount_minor: number;
  currency: string;
  occurred_on: string;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
  tags: string[];
  base_version: number | undefined;
}

/** Case-insensitive de-duplication that keeps the first spelling, like the server. */
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toTransactionBody(
  v: TransactionFormValues,
  baseVersion?: number,
): TransactionBody {
  return {
    kind: v.kind,
    amount_minor: parseAmount(v.amount, v.currency),
    currency: v.currency,
    occurred_on: v.occurredOn,
    category_id: v.kind === "income" ? null : v.categoryId,
    merchant: v.merchant?.trim() || null,
    note: v.note?.trim() || null,
    tags: dedupeTags(v.tags),
    base_version: baseVersion,
  };
}
