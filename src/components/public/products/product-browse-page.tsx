"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useVisibleProductsByTypes } from "@/services/products";
import {
  useParticipationCounts,
  type ParticipationCounts,
} from "@/services/participations";
import type { ProductType, ProductBrowseRow, SpokenLanguage } from "@/types";
import { productTypeSupportsDayFilter } from "./filter-products";
import { SHOP_PRODUCT_TYPES } from "./use-shop-category";
import { ProductBrowseResults } from "./product-browse-results";

interface ProductBrowsePageProps {
  /** Single type rendered in the browse grid. */
  browseType: ProductType;
  /** Server-prefetched product list (all shop types) — see `shop/page.tsx`. */
  initialProducts: ProductBrowseRow[];
  /** Server-prefetched seat counts keyed on the prefetched products' ids. */
  initialCounts: ParticipationCounts[];
  /** Server-prefetched spoken-language reference set for the filter strip. */
  initialSpokenLanguages: SpokenLanguage[];
}

// Heading + subheading copy live under productBrowse.headings/subheadings,
// keyed on the browseType. We resolve to literal keys here (rather than
// templating with the type name) so next-intl's typed t() call narrows
// to a known message path. The shop only ever browses consumer clubs and
// camps, so those are the only two heading keys; municipality_club and event
// never reach a browse grid but must appear in the Record to keep it total
// over ProductType — they map to consumer-club copy and are never looked up.
type HeadingKey = "consumer_club" | "camp";
const HEADING_KEYS: Record<ProductType, HeadingKey> = {
  consumer_club: "consumer_club",
  municipality_club: "consumer_club",
  camp: "camp",
  event: "consumer_club",
};

function headingFor(t: ReturnType<typeof useTranslations<"productBrowse">>, key: HeadingKey): string {
  switch (key) {
    case "consumer_club":
      return t("headings.consumer_club");
    case "camp":
      return t("headings.camp");
  }
}

function subheadingFor(
  t: ReturnType<typeof useTranslations<"productBrowse">>,
  key: HeadingKey,
): string {
  switch (key) {
    case "consumer_club":
      return t("subheadings.consumer_club");
    case "camp":
      return t("subheadings.camp");
  }
}

export function ProductBrowsePage({
  browseType,
  initialProducts,
  initialCounts,
  initialSpokenLanguages,
}: ProductBrowsePageProps) {
  const t = useTranslations("productBrowse");

  // Load every shop-surfaced type in one fetch; the selected browseType is
  // applied client-side below, so switching the Type filter is instant (no
  // refetch). Counts (keyed on these ids) likewise cover all types at once.
  // `initialProducts` is server-prefetched (shop/page.tsx), so `data` is
  // populated on the first frame and there's no loading state to gate on; the
  // hook still refetches on mount.
  const { data: products } = useVisibleProductsByTypes(SHOP_PRODUCT_TYPES, {
    initialData: initialProducts,
  });
  // The filter chips are a fixed list (PRODUCT_TOPICS) — no query to await.

  // Pre-fetch participation counts for every product in one query so each
  // card doesn't issue its own request. Cards read counts via the shared
  // map below — the counts query is the single source of truth.
  const productIds = useMemo(
    () => (products ?? []).map((p) => p.id),
    [products],
  );
  const { data: counts } = useParticipationCounts(productIds, {
    initialData: initialCounts,
  });
  const countsByProduct = useMemo(() => {
    const map = new Map<string, ParticipationCounts>();
    for (const c of counts ?? []) {
      map.set(c.productId, c);
    }
    return map;
  }, [counts]);

  // The Type filter is just a client-side narrowing of the all-types fetch to
  // the selected browseType. The chip filters apply on top inside
  // <ProductBrowseResults>.
  const typeProducts = useMemo(
    () => (products ?? []).filter((p) => p.product_type === browseType),
    [products, browseType],
  );

  // Days is a Clubs-only filter (recurring weekly schedule). Camps run over a
  // date range, so even though their slots carry weekdays we never narrow them
  // by day.
  const supportsDays = productTypeSupportsDayFilter(browseType);
  const headingKey = HEADING_KEYS[browseType];

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {headingFor(t, headingKey)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {subheadingFor(t, headingKey)}
        </p>
      </header>

      <div className="mx-auto mt-8 max-w-6xl">
        <ProductBrowseResults
          products={typeProducts}
          countsByProduct={countsByProduct}
          supportsDays={supportsDays}
          filters={{ initialSpokenLanguages }}
        />
      </div>
    </div>
  );
}
