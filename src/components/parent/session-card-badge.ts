/**
 * Cancellation context for a `canceling` club subscription — what a family
 * surface needs in order to say a membership is winding down and to name the
 * last evening the paid window covers.
 *
 * Built by the roll-up that turns participation rows into enrollment cards, and
 * declared apart from it because two equal consumers render it: the card on the
 * dashboard and the notice on the club page. A shape owned by one of them is
 * how the two end up disagreeing about what "last session" means.
 *
 * **Parent-only.** Every field here is downstream of a billing decision an
 * adult made, and the child-facing surfaces are structurally unable to receive
 * it.
 *
 * The corner *geometry* the family badges share is not here: it turned out to
 * be a card idea rather than a family-surface one (the gedu dashboard's backlog
 * count wears the same corner), so it lives in `ui/card-corner-badge`.
 */
export interface SessionCancellation {
  /** Instant paid access ends (`current_period_end`). */
  accessUntil: Date;
  /** Start of the participation's final covered session. */
  lastSessionStart: Date;
  /**
   * Whether that final session is the one the surface is otherwise pointing at
   * — the next one up, with nothing behind it. It changes the wording from
   * "won't renew, last session on the 18th" to "this is the last one".
   */
  isLastSession: boolean;
}
