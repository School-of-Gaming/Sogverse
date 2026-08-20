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
 * What one fan-out did, counted in **participations**: one seat on the roster,
 * one line in this tally, whoever the mail for it was addressed to.
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
 * Why a send did not happen, in the three flavours the card answers
 * differently.
 *
 * The first two are the session having moved on since this page loaded, and
 * neither can be retried into working — a refetch is what makes the card tell
 * the truth again. They are still told apart, because the card does two
 * genuinely different things with them.
 *
 * - `already_sent` — somebody else, or another tab, has already emailed it.
 *   **Nothing is said about this one.** The refetch puts the button into its
 *   sent state, and that state *is* the news: an error line beside a button
 *   saying the report went would be arguing with it. The reason still exists so
 *   the card knows to keep the button disabled rather than hand it back.
 * - `no_report` — the session no longer has a saved report to send. Worth
 *   saying, because the report the gedu was looking at is not there any more.
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
