/**
 * Shared corner geometry for the small circular/pill badges that straddle the
 * top-right corner of a session card (`PaymentProblemBadge`,
 * `SubscriptionEndingBadge`).
 *
 * Positioned `-top-2 -right-2` so the badge sits *on* the corner, half hanging
 * off the edge. The parent must provide a `relative` ancestor that does NOT
 * clip overflow — a `Card` with `overflow-hidden` would cut the badge in half,
 * so wrap such a card in a plain `relative` shell and render the badge as its
 * sibling. Because it lives over the corner (not in the body), it never reflows
 * card content — satisfies the "rendered content must not move" rule.
 *
 * Colour is deliberately NOT here: each badge supplies its own fill (red
 * `destructive` for a payment problem, muted grey for an informational
 * access-until note) so the geometry stays a single source of truth while the
 * severity reads from the colour. The `ring-2 ring-background` makes whatever
 * fill the badge picks read as a cut-out sitting on top of the corner.
 */
export const BADGE_FRAME =
  "absolute -right-2 -top-2 z-10 inline-flex h-7 items-center justify-center rounded-full shadow-sm ring-2 ring-background";
