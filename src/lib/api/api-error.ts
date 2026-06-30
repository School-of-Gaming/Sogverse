/**
 * Error thrown by service methods when an internal API route returns a non-OK
 * response. It carries the HTTP status so the caller can tell an actionable
 * client error (4xx) from an unexpected server failure (5xx — show a localized
 * generic instead). The optional `code` is a stable machine-readable
 * discriminator the route attaches to user-actionable errors so the client can
 * map it to a *localized* string — the route's `message` is raw English and is
 * for logs only, never for display. Extends Error, so existing
 * `err instanceof Error` handlers keep working unchanged.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True for 5xx — an unexpected failure with no user-actionable message. */
  get isServerError(): boolean {
    return this.status >= 500;
  }
}
