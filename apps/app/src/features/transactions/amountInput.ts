import { getExponent, parseAmount } from "@nextcent/shared";

/**
 * Keypad reducer for the amount text. Keys are "0"-"9", "." and "back". The result may end with a
 * dot while typing ("5."); `normalizeAmount` removes it on submit. It never exceeds the maximum amount.
 */
export function pressKey(
  current: string,
  key: string,
  currency: string,
): string {
  const exponent = getExponent(currency);
  if (key === "back") return current.slice(0, -1);
  if (key === ".") {
    if (current.includes(".")) return current;
    return current === "" ? "0." : `${current}.`;
  }
  if (!/^[0-9]$/.test(key)) return current;
  if (current.includes(".")) {
    const decimals = current.split(".")[1]!.length;
    if (decimals >= exponent) {
      // A zero-decimal currency does not take fraction digits: drop the dangling dot.
      return exponent === 0 && current.endsWith(".")
        ? current.slice(0, -1)
        : current;
    }
  }
  const next = current === "0" || current === "" ? key : current + key;
  try {
    parseAmount(next.endsWith(".") ? `${next}0` : next, currency);
  } catch {
    return current;
  }
  return next;
}

/** Trims an amount string to what the currency allows (used when the currency changes). */
export function fitToCurrency(amount: string, currency: string): string {
  const exponent = getExponent(currency);
  const [whole = "", fraction] = amount.split(".");
  if (fraction === undefined) return amount;
  if (exponent === 0) return whole;
  return `${whole}.${fraction.slice(0, exponent)}`;
}

/** The amount as submitted: trimmed, without a dangling decimal dot ("5." becomes "5"). */
export function normalizeAmount(amount: string): string {
  return amount.trim().replace(/\.$/, "");
}
