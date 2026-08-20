/**
 * Emailing a session's report to the families: what the feed hands back from a
 * send, and the one distinction a failed send has to be able to make.
 *
 * The feed runs the send the way it runs a save — the callback belongs to
 * whoever owns the data, the in-flight flag and the message belong to the feed
 * — so these are the two shapes that cross that boundary. Neither knows
 * anything about HTTP: the layer that speaks to the route translates a status
 * into one of these, exactly as the save path translates a half-written session
 * into its own error, and the feed picks copy from the answer.
 */

/**
 * What one fan-out did, counted in **participations** — the same unit the
 * confirm dialog counts in, so the number promised and the number reported
 * cannot disagree.
 *
 * `skipped` is a seat with nobody to write to. It is not a failure: nothing
 * went wrong, there was simply no address. `failed` is a send the mail provider
 * refused, and a result carrying one is a **partial** success — the families
 * who did receive it must not receive it twice, so the session stays sent.
 */
export interface SessionReportSendResult {
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Why a send did not happen, in the three flavours the card renders
 * differently.
 *
 * The first two are the session having moved on since this page loaded, and
 * neither can be retried into working — a refetch is what makes the card tell
 * the truth again. They are told apart because they are two different pieces of
 * news, and the gedu's next step differs: one report has reached the families
 * already, the other has nothing to reach them with.
 *
 * - `already_sent` — somebody else, or another tab, has already emailed it.
 * - `no_report` — the session no longer has a saved report to send.
 * - `failed` — nothing was delivered and the session stands unsent, so the
 *   button comes back and the gedu may try again.
 */
export type SessionReportSendFailure =
  | "already_sent"
  | "no_report"
  | "failed";

/**
 * Thrown by whoever runs the send when it was refused.
 *
 * A class rather than a flag on a plain `Error` so the feed can ask
 * `instanceof` and get a compiler-checked answer about which message to show —
 * the same shape the partial-save error uses next door.
 */
export class SessionReportSendError extends Error {
  readonly reason: SessionReportSendFailure;

  constructor(reason: SessionReportSendFailure, options?: ErrorOptions) {
    super(`session report send refused: ${reason}`, options);
    this.name = "SessionReportSendError";
    this.reason = reason;
  }
}

/**
 * Which failure a caught value is.
 *
 * Anything that is not one of ours is a plain failure — a network drop, a bug —
 * and the retryable message is the honest answer for it. A function rather than
 * a bare `instanceof` at the call site, because the thing being narrowed comes
 * out of a `catch` as `unknown`.
 */
export function sessionReportSendFailure(
  error: unknown,
): SessionReportSendFailure {
  return error instanceof SessionReportSendError ? error.reason : "failed";
}
