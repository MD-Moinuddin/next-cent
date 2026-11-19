import { z } from "zod";
import { isSupportedCurrency, MoneyError, parseAmount } from "./money";

export const onboardingSchema = z
  .object({
    currency: z.string().refine(isSupportedCurrency, "unsupported_currency"),
    openingBalance: z.string().trim().optional(),
    monthlyIncome: z.string().trim().optional(),
  })
  .superRefine((values, ctx) => {
    if (!isSupportedCurrency(values.currency)) return;
    for (const key of ["openingBalance", "monthlyIncome"] as const) {
      const raw = values[key];
      if (!raw) continue;
      try {
        parseAmount(raw, values.currency);
      } catch (e) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: e instanceof MoneyError ? e.code : "invalid_amount",
        });
      }
    }
  });

export type OnboardingValues = z.infer<typeof onboardingSchema>;

export interface MePatchBody {
  home_currency: string;
  opening_balance_minor?: number;
  monthly_income_minor?: number;
  onboarding_completed?: boolean;
}

export function toMePatch(
  values: OnboardingValues,
  options: { completeOnboarding?: boolean } = {},
): MePatchBody {
  const patch: MePatchBody = { home_currency: values.currency };
  // An opening balance of "0"/"0.00" IS sent as opening_balance_minor: 0 on purpose (the API
  // accepts >= 0), whereas a zero income is omitted below.
  if (values.openingBalance)
    patch.opening_balance_minor = parseAmount(
      values.openingBalance,
      values.currency,
    );
  const income = values.monthlyIncome
    ? parseAmount(values.monthlyIncome, values.currency)
    : 0;
  if (income > 0) patch.monthly_income_minor = income;
  if (options.completeOnboarding) patch.onboarding_completed = true;
  return patch;
}
