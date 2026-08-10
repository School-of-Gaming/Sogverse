/**
 * Cancellation context for a `canceling` club subscription — what the
 * **dashboard's enrollment card** needs in order to say a membership is winding
 * down, and to name the last evening the paid window covers *when it is
 * entitled to*.
 *
 * Built by the roll-up that turns participation rows into enrollment cards, and
 * consumed by the card those become. Declared apart from the roll-up so the
 * type does not have to travel through it to reach the card.
 *
 * **The club page's notice does not share this type**, and that is a decision
 * rather than an oversight: it carries the participation-level half only,
 * because a page about a whole enrollment has no "is this the session I am
 * pointing at" question to answer, which is what `isLastSession` exists for.
 * Two shapes, because the two surfaces genuinely hold different material: this
 * one is derived by walking a schedule, the page's is read off a feed built
 * from the group's stored history.
 *
 * **The rule is one rule, and it is asymmetric — that asymmetry is the point.**
 * *Which* session is last is settled the same way for both: the furthest-out
 * one inside the paid window if any are still to come, otherwise the most
 * recent one that already ran. But this surface may only **name** it in the
 * first case, where a forward projection supplies it. In the second it has
 * nothing to name it from — the dashboard read carries no session rows — so it
 * reports `lastSessionStart: null` and the card says when access ends instead.
 *
 * The club page names it in both cases, and the honest statement of why is that
 * the page has the **better** answer rather than a certain one: it reads off a
 * feed merged from the group's stored rows, so where a row exists the date it
 * names is that row's own snapshot, and where none does it is the same kind of
 * projection this card would have made. What the page never does is contradict
 * the sessions listed beneath it, because it reads the date off that very list.
 * The card is silent in the second case because *it* could only ever guess —
 * not because the page is always certain. The whole argument is at
 * `cancellationFor()` beside the roll-up; changing the rule is an edit there
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
  /**
   * Start of the participation's final covered session — or **`null` when the
   * card is not entitled to name one**, which is the case once the paid window
   * has no session left in it.
   *
   * The dashboard read carries no session rows, only the product's *current*
   * schedule, so the only way to name a session that has already run would be
   * to project one backwards — and a schedule edited mid-term makes that
   * projection name an evening that never happened. So the card stops naming
   * and says when access ends instead. The club page, which holds the group's
   * stored history, names the best answer available: the stored row's own
   * snapshot where a row exists, a projection where none does. See
   * `cancellationFor` beside the roll-up for the whole argument.
   */
  lastSessionStart: Date | null;
  /**
   * Whether that final session is the one the surface is otherwise pointing at
   * — the next one up, with nothing behind it. It changes the wording from
   * "won't renew, last session on the 18th" to "this is the last one".
   *
   * Always `false` when `lastSessionStart` is `null`: there is no session being
   * pointed at for it to be a claim about.
   */
  isLastSession: boolean;
}
