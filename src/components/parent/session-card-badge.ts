/**
 * Cancellation context for a `canceling` club subscription — what the
 * **dashboard's enrollment card** needs in order to say a membership is winding
 * down and to name the last evening the paid window covers.
 *
 * Built by the roll-up that turns participation rows into enrollment cards, and
 * consumed by the card those become. Declared apart from the roll-up so the
 * type does not have to travel through it to reach the card.
 *
 * **The club page's notice does not share this type**, and that is a decision
 * rather than an oversight: it carries the participation-level half only — the
 * access instant, and a *nullable* last session — because a page about a whole
 * enrollment has no "is this the session I am pointing at" question to answer,
 * which is what `isLastSession` exists for. Two shapes, because the two
 * surfaces genuinely hold different material: this one is derived by walking a
 * schedule, the page's is read off a feed it has already built.
 *
 * **What the two do share is the rule for what "last session" means**, and that
 * rule is stated once, beside the roll-up, at `lastCoveredSession()`: the
 * furthest-out session inside the paid window if any are still to come, and
 * otherwise the most recent one that already ran. Changing it is an edit there
 * plus a check that the page still reads the same answer off its feed.
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
