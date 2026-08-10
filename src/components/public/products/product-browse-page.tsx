"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useVisibleProductsByTypes } from "@/services/products";
import {
  useParticipationCounts,
  type ParticipationCounts,
} from "@/services/participations";
import type { ProductBrowseRow, SpokenLanguage } from "@/types";
import {
  CATEGORY_TYPE,
  SHOP_PRODUCT_TYPES,
  type ShopCategory,
} from "./shop-categories";
import { ProductBrowseResults } from "./product-browse-results";

interface ProductBrowsePageProps {
  /** Categories to render as sections, in display order — already expanded
   *  from the URL selection by `<ShopBrowse>`, so an empty selection arrives
   *  here as every category rather than as nothing. */
  categories: readonly ShopCategory[];
  /** Server-prefetched product list (all shop types) — see `shop/page.tsx`. */
  initialProducts: ProductBrowseRow[];
  /** Server-prefetched seat counts keyed on the prefetched products' ids. */
  initialCounts: ParticipationCounts[];
  /** Server-prefetched spoken-language reference set for the filter strip. */
  initialSpokenLanguages: SpokenLanguage[];
}

// Section heading copy lives under productBrowse.sections, keyed on the shop
// category. We resolve to literal keys here (rather than templating with the
// category name) so next-intl's typed t() call narrows to a known message path.
function sectionHeading(
  t: ReturnType<typeof useTranslations<"productBrowse">>,
  category: ShopCategory,
): string {
  switch (category) {
    case "clubs":
      return t("sections.clubs");
    case "camps":
      return t("sections.camps");
    case "events":
      return t("sections.events");
  }
}

export function ProductBrowsePage({
  categories,
  initialProducts,
  initialCounts,
  initialSpokenLanguages,
}: ProductBrowsePageProps) {
  const t = useTranslations("productBrowse");

  // Load every shop-surfaced type in one fetch; the selected categories are
  // applied client-side below, so toggling a Type chip is instant (no refetch).
  // Counts (keyed on these ids) likewise cover all types at once.
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

  // The Type filter is just a client-side narrowing of the all-types fetch into
  // one section per visible category. The chip filters apply on top, across
  // every section, inside <ProductBrowseResults>.
  const sections = useMemo(
    () =>
      categories.map((category) => ({
        id: category,
        heading: sectionHeading(t, category),
        products: (products ?? []).filter(
          (p) => p.product_type === CATEGORY_TYPE[category],
        ),
      })),
    [categories, products, t],
  );

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      {/* The storefront carries no visible page title — the section headings
          say what each block is, and a banner above them would only repeat the
          nav item that got the parent here. The h1 stays in the document so the
          section h2s hang off something. */}
      <h1 className="sr-only">{t("pageTitle")}</h1>

      {/* Wider than the usual 6xl reading column: the filter rail takes a fixed
          slice of it from `lg` up, and the cards need the rest to stay legible
          at three columns. */}
      <div className="mx-auto max-w-7xl">
        <ProductBrowseResults
          sections={sections}
          counts={counts ?? []}
          filters={{ initialSpokenLanguages }}
        />
      </div>
    </div>
  );
}
