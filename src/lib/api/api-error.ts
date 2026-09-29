/**
 * Error thrown by service methods when an internal API route returns a non-OK
 * response. It carries the HTTP status, and optionally the stable
 * machine-readable `code` a route may attach to a user-actionable error. The
 * route's `message` is raw English and is for logs only, never for display — a
 * caller that wants to show something picks a localized string of its own.
 * Extends Error, so existing `err instanceof Error` handlers keep working
 * unchanged.
 *
 * A route that throws one with a `code` has it forwarded by the `defineRoute`
 * wrapper beside the generic message, and a service reading the response with
 * `readApiError` hands it back to the caller — which is how a dialog tells one
 * refusal it can explain apart from every other failure. Other codes a client
 * receives (`PIN_REQUIRED`, `GEDU_UNCERTIFIED`, `PIN_LOCKED`) are attached to
 * hand-built responses by the role gate and the PIN route, and reach this class
 * the same way, through `readApiError`.
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
}
