/**
 * Error thrown by service methods when an internal API route returns a non-OK
 * response. It carries the HTTP status, and optionally the stable
 * machine-readable `code` a route may attach to a user-actionable error. The
 * route's `message` is raw English and is for logs only, never for display — a
 * caller that wants to show something picks a localized string of its own.
 * Extends Error, so existing `err instanceof Error` handlers keep working
 * unchanged.
 *
 * No client currently branches on `code`: the one that did mapped a Minecraft
 * already-linked conflict that no longer exists. It is still carried because
 * the route layer populates it generically, so the next caller that needs to
 * distinguish two 4xx outcomes has it without a round trip.
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
