/** The first user-facing message in a Clerk API error, or undefined when the error has none. */
export function clerkErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const list = (err as { errors?: unknown }).errors;
  if (!Array.isArray(list)) return undefined;
  const first = list[0] as
    { longMessage?: unknown; message?: unknown } | undefined;
  const text = first?.longMessage ?? first?.message;
  return typeof text === "string" && text.trim() ? text : undefined;
}
