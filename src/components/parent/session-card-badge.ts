/**
 * Per-card cancellation context for a `canceling` club subscription. Built in
 * `expandUpcomingSessions` and carried by every remaining card of the
 * participation, so it lives beside the cards rather than inside either of
 * them. `accessUntil`/`lastSessionStart` are constant across the
 * participation's cards (they describe the participation); `isLastSession`
 * varies per occurrence. Parent-only — see `SubscriptionEndingBadge`.
 *
 * The corner *geometry* these badges share is not here: it turned out to be a
 * card idea rather than a family-surface one (the gedu dashboard's backlog
 * count wears the same corner), so it lives in `ui/card-corner-badge`.
 */
export interface SessionCancellation {
  /** Instant paid access ends (`current_period_end`). */
  accessUntil: Date;
  /** Start of the participation's final remaining session. */
  lastSessionStart: Date;
  /** Whether THIS card is that final session. */
  isLastSession: boolean;
}
