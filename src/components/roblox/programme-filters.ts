import {
  EMPTY_FILTERS,
  type BrowseFilters,
  type ProductFormat,
  type ProductPriceFilter,
} from "@/components/public/products/filter-products";
import type { ProductTopic } from "@/types";

// Which storefront products belong to the Roblox programme. The programme has
// no catalogue of its own — it is a slice of the ordinary shop — so these
// narrowings are the definition of "a programme product", at two widths:
//
// - **The shop slice** — Roblox Studio, free. What every "register" / "get
//   started" CTA on `/roblox` lands on, spelled into those hrefs as `?topic=` /
//   `?price=` query params (see the programme entries in `routes.ts`).
// - **The rail slice** — the shop slice, online only. What the Upcoming Events
//   carousel shows, read by both halves of that section: the server prefetch
//   and the client component that re-derives the same slice from the live
//   query.
//
// The rail is deliberately the narrower of the two, so the shop link under it
// is a real widening rather than the same list in a different layout.
//
// Deliberately NOT a "use client" module. The programme page's Server Component
// imports these values to run its prefetch, and a runtime value imported from a
// "use client" file into a Server Component is a client-reference placeholder
// rather than the real object (the shop's category constants live in a plain
// module for exactly this reason).
//
// The browse-filter hook parses the CTA hrefs back into this same shape, so the
// URL and these constants say one thing in two grammars. Keep them in sync.

/** The programme's topic — one value of the `product_topic` enum. */
export const PROGRAMME_TOPIC: ProductTopic = "roblox_studio";

/** Every programme link and the rail narrow to free products. */
export const PROGRAMME_PRICE: ProductPriceFilter = "free";

/** The rail alone narrows further, to online products. */
const PROGRAMME_RAIL_FORMAT: ProductFormat = "online";

/**
 * The Upcoming Events rail's slice as the shared browse filter expresses it —
 * every other filter left at its no-op value, so this narrows on topic, price
 * and format and on nothing else. Passed to the shared `filterProducts` rather
 * than hand-rolling a second predicate: the storefront and this page must agree
 * on what a match is.
 */
export const PROGRAMME_RAIL_FILTERS: BrowseFilters = {
  ...EMPTY_FILTERS,
  topics: [PROGRAMME_TOPIC],
  price: PROGRAMME_PRICE,
  format: PROGRAMME_RAIL_FORMAT,
};
