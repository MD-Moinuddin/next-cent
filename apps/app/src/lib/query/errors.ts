import type { Problem } from "@/lib/types";

export class ApiError extends Error {
  readonly status: number;
  readonly problem?: Problem;
  constructor(status: number, problem?: Problem) {
    super(problem?.title ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
  get code(): string | undefined {
    return this.problem?.code;
  }
}

export class NetworkError extends Error {
  readonly originalError: unknown;
  constructor(originalError: unknown) {
    super("Network request failed");
    this.name = "NetworkError";
    this.originalError = originalError;
  }
}

/** No signed-in session, so there is no token to send (never send `Bearer null`). */
export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "NotSignedInError";
  }
}

/** The API rejected the token: the session lapsed or was revoked. */
export const isUnauthorized = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401;

export function isRetryable(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError)
    return error.status >= 500 || error.status === 429 || error.status === 408;
  return false;
}

interface CallResult<T> {
  data?: T;
  error?: unknown;
  response?: Pick<Response, "ok" | "status">;
}

const isProblem = (e: unknown): e is Problem =>
  typeof e === "object" && e !== null;

/** Turns the generated client's `{data, error, response}` result into data or a typed throw. */
export async function unwrap<T>(call: Promise<CallResult<T>>): Promise<T> {
  let result: CallResult<T>;
  try {
    result = await call;
  } catch (e) {
    throw new NetworkError(e);
  }
  const { response } = result;
  if (!response) throw new NetworkError(result.error);
  if (result.error !== undefined || !response.ok) {
    throw new ApiError(
      response.status,
      isProblem(result.error) ? result.error : undefined,
    );
  }
  return result.data as T;
}
