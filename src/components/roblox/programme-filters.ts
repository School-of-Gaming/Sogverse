import {
  EMPTY_FILTERS,
  type BrowseFilters,
} from "@/components/public/products/filter-products";
import type { ProductTopic, SpokenLanguageCode } from "@/types";

// Which storefront products belong to the Roblox programme: Roblox Studio, in
// French. The programme has no catalogue of its own — it is a slice of the
// ordinary shop — so this narrowing is the definition of "a programme product"
// and both halves of the page read it: the server prefetch behind the Upcoming
// Events grid and the client component that re-derives the same slice from the
// live query.
//
// Deliberately NOT a "use client" module. The programme page's Server Component
// imports these values to run its prefetch, and a runtime value imported from a
// "use client" file into a Server Component is a client-reference placeholder
// rather than the real object (the shop's category constants live in a plain
// module for exactly this reason).
//
// The two values are also spelled into the CTA hrefs as `?topic=` / `?lang=`
// query params (see the programme entries in `routes.ts`) — the browse-filter
// hook parses those back into this same shape, so the URL and this constant say
// one thing in two grammars. Keep them in sync.

/** The programme's topic — one value of the `product_topic` enum. */
export const PROGRAMME_TOPIC: ProductTopic = "roblox_studio";

/** The language the programme is delivered in: it runs in France. */
export const PROGRAMME_LANGUAGE: SpokenLanguageCode = "fr";

/**
 * The programme's slice as the shared browse filter expresses it — every other
 * filter left at its no-op value, so this narrows on topic and language and on
 * nothing else. Passed to the shared `filterProducts` rather than hand-rolling a
 * second predicate: the storefront and this page must agree on what a match is.
 */
export const PROGRAMME_PRODUCT_FILTERS: BrowseFilters = {
  ...EMPTY_FILTERS,
  topics: [PROGRAMME_TOPIC],
  languages: [PROGRAMME_LANGUAGE],
};
