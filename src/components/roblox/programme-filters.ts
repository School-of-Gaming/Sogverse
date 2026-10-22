import {
  EMPTY_FILTERS,
  type BrowseFilters,
  type ProductPriceFilter,
} from "@/components/public/products/filter-products";
import type { ProductRailSelection } from "@/components/public/products/product-rail-selection";
import type { ProductTopic } from "@/types";

// Which storefront products belong to the Roblox programme. The programme has
// no catalogue of its own — it is a slice of the ordinary shop — so these
// narrowings are the definition of "a programme product": Roblox Studio, free,
// in any format. The Upcoming Events carousel shows that slice, read by both
// halves of the shared product rail pipeline — the server prefetch and the
// client hook that re-derives the same slice from the live query — and every
// "register" / "get started" CTA on `/roblox` lands on it in the shop, spelled
// into those hrefs as `?topic=` / `?price=` query params (see the programme
// entries in `routes.ts`).
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

/** The programme narrows to free products. */
export const PROGRAMME_PRICE: ProductPriceFilter = "free";

/**
 * The programme's slice as the shared browse filter expresses it — every other
 * filter left at its no-op value, so this narrows on topic and price and on
 * nothing else. Matched by the shared `filterProducts`, through the rail
 * selection below, rather than by a second hand-rolled predicate: the
 * storefront and this page must agree on what a match is.
 */
const PROGRAMME_FILTERS: BrowseFilters = {
  ...EMPTY_FILTERS,
  topics: [PROGRAMME_TOPIC],
  price: PROGRAMME_PRICE,
};

/**
 * The programme's slice as the shared product rail pipeline takes it — one
 * constant, so the server's prefetch and the client's live query narrow by the
 * same value.
 */
export const PROGRAMME_RAIL_SELECTION: ProductRailSelection = {
  kind: "filters",
  filters: PROGRAMME_FILTERS,
};
