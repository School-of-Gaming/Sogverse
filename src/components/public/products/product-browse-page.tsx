"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useVisibleProductsByTypes } from "@/services/products";
import {
  useParticipationCounts,
  type ParticipationCounts,
} from "@/services/participations";
import type { ProductType } from "@/types";
import { filterProducts } from "./filter-products";
import { useBrowseFilters } from "./use-browse-filters";
import { SHOP_PRODUCT_TYPES } from "./use-shop-category";
import { ProductBrowseCard } from "./product-browse-card";
import { ProductBrowseFilters } from "./product-browse-filters";

interface ProductBrowsePageProps {
  /** Single type rendered in the browse grid. */
  browseType: ProductType;
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

export function ProductBrowsePage({ browseType }: ProductBrowsePageProps) {
  const t = useTranslations("productBrowse");

  // Load every shop-surfaced type in one fetch; the selected browseType is
  // applied client-side below, so switching the Type filter is instant (no
  // refetch). Counts (keyed on these ids) likewise cover all types at once.
  const { data: products, isLoading: productsLoading } =
    useVisibleProductsByTypes(SHOP_PRODUCT_TYPES);
  // The filter chips are a fixed list (PRODUCT_TOPICS) — no query to await.

  // Pre-fetch participation counts for every product in one query so each
  // card doesn't issue its own request. Cards read counts via the shared
  // map below — the counts query is the single source of truth.
  const productIds = useMemo(
    () => (products ?? []).map((p) => p.id),
    [products],
  );
  const { data: counts, isLoading: countsLoading } =
    useParticipationCounts(productIds);
  const countsByProduct = useMemo(() => {
    const map = new Map<string, ParticipationCounts>();
    for (const c of counts ?? []) {
      map.set(c.productId, c);
    }
    return map;
  }, [counts]);

  // Wait on every query the page renders before painting, so the grid doesn't
  // land first and then reflow as counts arrive (CLAUDE.md layout-shift rule).
  const allLoaded = !productsLoading && !countsLoading;

  // The Type filter is just a client-side narrowing of the all-types fetch to
  // the selected browseType. Topic/format/language filters apply on top.
  const typeProducts = useMemo(
    () => (products ?? []).filter((p) => p.product_type === browseType),
    [products, browseType],
  );

  const { topics, format, languages } = useBrowseFilters();
  const filtered = useMemo(
    () => filterProducts(typeProducts, { topics, format, languages }),
    [typeProducts, topics, format, languages],
  );

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
        {!allLoaded ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <section className="space-y-3">
            <ProductBrowseFilters />

            {filtered.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((p) => (
                  <ProductBrowseCard
                    key={p.id}
                    product={p}
                    counts={countsByProduct.get(p.id) ?? null}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  {typeProducts.length === 0
                    ? t("empty.noProducts")
                    : t("empty.noMatches")}
                </CardContent>
              </Card>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
