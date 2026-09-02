/**
 * **The tones a product fact owns, decided once here rather than per surface.**
 *
 * The grammar's corollary is that a fact owns its colour and picks it in a
 * shared map beside the fact — a surface choosing its own is how one meaning
 * acquires three. Eligibility is the fact that had done exactly that: the shop
 * card's corner chip answered "who may hold this seat" in wit while the
 * overview card beside it answered the same question in harmony, and the admin
 * list row split the same way again. Both were visible on one page.
 *
 * **Eligibility is wit's word**, and the sourced precedent is the region-lock
 * strip: whether a product is *for you* — your age, your audience, the language
 * the session is delivered in, the country it is sold in — is a piece of
 * knowledge about the offer, not a fact about people. Wit's ink is always the
 * soft variant, which is the strength axis's mechanism rather than a choice
 * made here.
 *
 * **A headcount is a different fact and stays harmony**: seats, capacity, how
 * many of them still fit. Those are about the people in the room rather than
 * about who is admitted to it, so they keep the people family at their own
 * sites and are deliberately not in this map.
 *
 * This module lives beside the public product renderers because that is where
 * the shop, the detail page and the confirmation view already read their
 * product-fact helpers from — and the admin list and details pages read from
 * here too, which is the point: an eligibility fact is one colour whoever is
 * looking at it.
 *
 * Classes are literal strings because Tailwind scans source text.
 */
export const PRODUCT_FACT_TONES = {
  /**
   * Who may hold the seat — an audience, an age range, the spoken language, the
   * region gate. Ink only, on a neutral ground where the mark has one.
   */
  eligibility: "text-yty-wit-soft",
} as const;
