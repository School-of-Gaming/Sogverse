// Who a product is *designed for* — the short badge a family scans a grid with
// ("Neuroinclusive", "Beginner", "Advanced"). It answers a different question
// from the audience label beside it: an audience says who may hold the seat, a
// tag says who the thing was built for.
//
// **A tag is real data.** `products.tag` is a nullable `product_tag` column,
// both product-writing RPCs carry it, and an admin sets it on the product form
// — so the value a card renders came from a person deciding it, not from a
// scene fixture. Null is untagged, which is the ordinary state and renders
// nothing at all: no chip, no explanation block.
//
// **The canonical type is the `ProductTag` alias in `src/types/index.ts`**,
// generated from the enum. This module re-exports it so the surfaces that
// already import a tag type from here keep working, and so that the label
// resolution below sits next to the type it resolves. Adding a value to the
// enum is a migration; the map below then fails to compile until its copy is
// written, which is the point of routing every rendered tag through it.
//
// Four things live here: the type, the ordered value list, the string guard and
// the label resolution. The list and the guard arrived with the shop's tag
// filter row — the row is what needs to enumerate the vocabulary and to read a
// tag back out of a URL — and every surface that wants either now takes it from
// here, the admin form's picker included. Both are derived from the generated
// `Constants` object rather than written out, because a hand-maintained copy of
// the database's vocabulary is born stale.

import { Constants, type ProductTag } from "@/types";

export type { ProductTag };

/**
 * Every tag value, in the order the enum declares them — which is the order the
 * shop's filter chips and the admin form's picker both present, so a parent and
 * the admin who tagged the product read the same list in the same sequence.
 *
 * Derived from codegen: a fourth tag added by migration appears in both places
 * the moment types are regenerated, and the label map below fails to compile
 * until its copy is written.
 */
export const PRODUCT_TAG_VALUES: readonly ProductTag[] =
  Constants.public.Enums.product_tag;

/**
 * Whether an arbitrary string is a tag value — the guard the filter row reads
 * its URL param through, so a hand-edited or stale `?tag=` term resolves to no
 * selection rather than narrowing the grid to nothing.
 *
 * Compared value-by-value rather than by `includes`, so the caller's plain
 * `string` needs no cast to be checked against the generated literal union.
 */
export function isProductTag(value: string): value is ProductTag {
  return PRODUCT_TAG_VALUES.some((tag) => tag === value);
}

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
 * The `satisfies Record<ProductTag, string>` is the exhaustiveness check
 * against codegen: `ProductTag` is the generated enum, so a value added to the
 * database with no key here fails to compile.
 *
 * Unlike `audienceLabelKey`, there is no null case: a tag is optional on the
 * product, so "no label" is the absence of a tag rather than a tag that
 * declines to label itself. A caller holding `ProductTag | null` decides that
 * before it gets here.
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

// ---------------------------------------------------------------------------
// **`productTagDetail.*` is engineer-written copy awaiting the owner's text.**
//
// The same keys as `productTag.*`, in the same five message files, carrying the
// sentence or two the product detail page prints under the chip — what SOG
// actually does about the tag (small groups and a predictable structure; start
// from zero; a real challenge). Every one of those strings, in every locale,
// was written by an engineer so the surface could be looked at, and was
// **cleared to ship as-is on 2026-08-12** after review in the preview scenes —
// live is fine, this is not a launch blocker. It is still not the final text:
// **Sonja is writing the real source copy, and these get replaced wholesale as
// a follow-up** — do not polish them, do not translate around them, and do not
// treat the current English as a source anybody wants preserved.
//
// The marker lives here rather than in the message files because those are
// strict JSON with no comment syntax and no key convention for annotations;
// this module is what owns the vocabulary the namespace is keyed by, so it is
// the one place a reader of either half will pass through.
// ---------------------------------------------------------------------------
