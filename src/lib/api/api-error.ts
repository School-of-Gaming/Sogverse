/**
 * Error thrown by service methods when an internal API route returns a non-OK
 * response. It carries the HTTP status, and optionally the stable
 * machine-readable `code` a route may attach to a user-actionable error. The
 * route's `message` is raw English and is for logs only, never for display — a
 * caller that wants to show something picks a localized string of its own.
 * Extends Error, so existing `err instanceof Error` handlers keep working
 * unchanged.
 *
 * `code` is currently carried but unused at both ends, and it is worth knowing
 * why before relying on it. No route passes one, so the wrapper's forwarding of
 * it never fires; the codes a client actually receives (`PIN_REQUIRED`,
 * `GEDU_UNCERTIFIED`, `PIN_LOCKED`) are attached to hand-built responses by the
 * role gate and the PIN route, and reach this class only where a service copies
 * `code` off the response body. Nothing branches on the result — the one client
 * that did was mapping a Minecraft already-linked conflict that no longer
 * exists. The slot stays because the plumbing on both sides is already written.
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
