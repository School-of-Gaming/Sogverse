/**
 * Error thrown by service methods when an internal API route returns a non-OK
 * response. It carries the HTTP status so the caller can tell an actionable
 * client error (4xx — the route's message is worth showing) from an unexpected
 * server failure (5xx — show a localized generic instead of the route's raw,
 * untranslated English text). Extends Error, so existing `err instanceof Error`
 * handlers keep working unchanged.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True for 5xx — an unexpected failure with no user-actionable message. */
  get isServerError(): boolean {
    return this.status >= 500;
  }
}
