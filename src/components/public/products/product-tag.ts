// Who a product is *designed for* — the short badge a family scans a grid with
// ("Neuroinclusive", "Beginner", "Advanced"). It answers a different question
// from the audience label beside it: an audience says who may hold the seat, a
// tag says who the thing was built for.
//
// **Display-side only, for now.** There is no `product_tags` column, no admin
// form field and no shop filter behind this yet: the vocabulary exists so the
// redesigned browse card can be judged in a preview scene before any of that is
// committed to. The DB enum, the admin form and the shop filter row land with
// the real feature — and when they do, this module is where the filter's
// chip-equals-tag rule belongs, exactly as `product-audience.ts` holds it for
// the audience badge. Until then the only source of a tag is a scene fixture.
//
// Deliberately just the type and the label resolution. A value list and a
// string guard were written first and had no callers: once the enum exists in
// the database, both come off the generated `Constants` object (the schema
// rule for every other enum in the app), so hand-maintained copies here would
// be born stale.

export type ProductTag = "neuroinclusive" | "beginner" | "advanced";

/**
 * The `productTag.*` message key a surface labels a tag with.
 *
 * The key and the value happen to be spelled the same today, and this map is
 * what makes that a fact rather than an assumption: every rendered tag goes
 * through here, so the day a stored value and its message key have to diverge
 * — a renamed enum member whose copy must not move, a tag that two surfaces
 * word differently — there is one edit, and the literal keys stay greppable
 * against the message files in the meantime.
 *
 * Unlike `audienceLabelKey`, there is no null case: a tag is optional on the
 * product, so "no label" is the absence of a tag rather than a tag that
 * declines to label itself.
 */
const TAG_LABEL_KEYS = {
  neuroinclusive: "neuroinclusive",
  beginner: "beginner",
  advanced: "advanced",
} as const satisfies Record<ProductTag, string>;

export type ProductTagLabelKey = (typeof TAG_LABEL_KEYS)[ProductTag];

export function productTagLabelKey(tag: ProductTag): ProductTagLabelKey {
  return TAG_LABEL_KEYS[tag];
}
