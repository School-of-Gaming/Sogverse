/**
 * **The family product page's colour, under the ruled grammar.**
 *
 * The owner's own brief for this page (2026-09-01) was that colour should
 * arrive from *families doing real jobs*, never from eligibility or decoration:
 * time rows in wit, liveness in glow, community facts in harmony. That is
 * exactly the set below:
 *
 * - **Time is wit.** The masthead's schedule row, the tag on a session still
 *   ahead, that session's card edge and its marker on the rail are all one
 *   fact — when this happens — and they all take the knowledge family.
 * - **Liveness is glow.** A session running right now swaps its tag to the same
 *   glow chip the enrollment card lights, so a family meets one Live mark
 *   whichever of the two pages they are on.
 * - **Community facts are harmony.** The Gedus label is the page's trust
 *   signal — who has my child for ninety minutes — and people are harmony.
 *   The chips under it stay neutral: they carry identicons and names, and the
 *   colour belongs on the label that says what they are.
 *
 * **Strong on edges and markers, soft on ink**, which is the mechanism the
 * element cards were signed off on: wit-strong cannot carry body text on this
 * ground, so it is reserved for the places no text sits. The rail's two future
 * markers step strong → soft rather than full → dimmed, because a dot at 40%
 * alpha is a brand colour mixed down toward the page, and wit's two variants
 * read far enough apart to carry the step on their own.
 *
 * **No grammar-fill button anywhere on this page**, deliberately. The delegated
 * button doctrine allows a family-coloured fill only where the action *is* that
 * family's word, and never beside a primary CTA — and the only button here is
 * the Join, which is the act and keeps amber. A valor "Book the camp" is the
 * shape the doctrine was written for; this page has no booking action, because
 * the family already holds the seat.
 *
 * It lives in a module of its own rather than beside a component because three
 * of them read it — the page body, the feed and the feed's rows — and one home
 * for the class strings is what keeps a marker and the tag beside it from
 * drifting apart. Classes are literal strings because Tailwind scans source
 * text.
 */
export interface FamilyProductTones {
  /** The masthead's schedule glyph. */
  scheduleGlyph: string;
  /** The micro-label over the gedu chips. */
  gedusLabel: string;
  /** The next session's card edge, on top of the card's own classes. */
  nextCard: string;
  /** The tag on a session that has started and not finished. */
  liveTag: string;
  /** The tag on a session still ahead. */
  futureTag: string;
  /** The rail marker on the next session. */
  nextMarker: string;
  /** The rail marker on a future session further out. */
  futureMarker: string;
}

export const FAMILY_PRODUCT_TONES: FamilyProductTones = {
  scheduleGlyph: "mt-0.5 h-4 w-4 shrink-0 text-yty-wit-soft",
  gedusLabel:
    "text-[11px] font-medium uppercase tracking-wider text-yty-harmony-soft",
  nextCard: "border-yty-wit-strong",
  liveTag: "border-yty-glow-strong bg-muted text-yty-glow-soft",
  futureTag: "border-yty-wit-strong bg-muted text-yty-wit-soft",
  nextMarker: "bg-yty-wit-strong",
  futureMarker: "bg-yty-wit-soft",
};
