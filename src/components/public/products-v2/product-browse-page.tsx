"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useVisibleProductsV2ByType, useTopicsV2, useTagsV2 } from "@/services/products-v2";
import {
  useMyParticipations,
  useParticipationCounts,
  type ParticipationCounts,
} from "@/services/participations";
import type { ProductTypeV2 } from "@/types";
import { filterProducts } from "./filter-products";
import { useBrowseFilters } from "./use-browse-filters";
import { ProductBrowseCard } from "./product-browse-card";
import { ProductBrowseFilters } from "./product-browse-filters";
import { ProductPurchasedCard } from "./product-purchased-card";

interface ProductBrowsePageProps {
  /** Single type rendered in the browse grid below. */
  browseType: ProductTypeV2;
  /**
   * Types pulled into the "your enrolled" section above. /clubs combines
   * consumer + municipality so a parent who registered for a muni club via
   * /registration sees it here too. /camps and /events are single-type.
   */
  purchasedTypes: ProductTypeV2[];
}

// Heading + subheading copy live under productBrowse.headings/subheadings,
// keyed on the browseType. We resolve to literal keys here (rather than
// templating with the type name) so next-intl's typed t() call narrows
// to a known message path. Municipality-club browse is not used by any
// route this pass; mapping it to the consumer-club copy is harmless and
// keeps the switch total.
type HeadingKey = "consumer_club" | "camp" | "event";
const HEADING_KEYS: Record<ProductTypeV2, HeadingKey> = {
  consumer_club: "consumer_club",
  municipality_club: "consumer_club",
  camp: "camp",
  event: "event",
};

function headingFor(t: ReturnType<typeof useTranslations<"productBrowse">>, key: HeadingKey): string {
  switch (key) {
    case "consumer_club":
      return t("headings.consumer_club");
    case "camp":
      return t("headings.camp");
    case "event":
      return t("headings.event");
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
    case "event":
      return t("subheadings.event");
  }
}

function purchasedHeadingFor(
  t: ReturnType<typeof useTranslations<"productBrowse">>,
  key: HeadingKey,
): string {
  switch (key) {
    case "consumer_club":
      return t("purchasedHeadings.consumer_club");
    case "camp":
      return t("purchasedHeadings.camp");
    case "event":
      return t("purchasedHeadings.event");
  }
}

export function ProductBrowsePage({
  browseType,
  purchasedTypes,
}: ProductBrowsePageProps) {
  const t = useTranslations("productBrowse");

  const { data: products, isLoading: productsLoading } =
    useVisibleProductsV2ByType(browseType);
  // The filter chips read from the same topics/tags queries — wait on them
  // too so the filter row appears with chips the first time it shows up
  // (avoids a brief "Topic: " empty row on cold cache).
  const { isLoading: topicsLoading } = useTopicsV2();
  const { isLoading: tagsLoading } = useTagsV2();

  // Pre-fetch participation counts for every product in one query so each
  // card doesn't issue its own request. Cards read counts via the shared
  // map below — the counts query is the single source of truth.
  const productIds = useMemo(
    () => (products ?? []).map((p) => p.id),
    [products],
  );
  const { data: counts } = useParticipationCounts(productIds);
  const countsByProduct = useMemo(() => {
    const map = new Map<string, ParticipationCounts>();
    for (const c of counts ?? []) {
      map.set(c.productId, c);
    }
    return map;
  }, [counts]);

  // Real "your enrolled" rail (replaces the prior ?mock=1 gate).
  const { data: myParticipations } = useMyParticipations();
  const purchasedRows = useMemo(() => {
    if (!myParticipations) return [];
    return myParticipations.filter(
      (p) =>
        p.product !== null && purchasedTypes.includes(p.product.product_type),
    );
  }, [myParticipations, purchasedTypes]);

  const allLoaded = !productsLoading && !topicsLoading && !tagsLoading;

  const { topics, tags, format, languages } = useBrowseFilters();
  const filtered = useMemo(
    () => filterProducts(products ?? [], { topics, tags, format, languages }),
    [products, topics, tags, format, languages],
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
          <div className="space-y-8">
            {purchasedRows.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">
                  {purchasedHeadingFor(t, headingKey)}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {purchasedRows.map((row) => (
                    <ProductPurchasedCard key={row.id} participation={row} />
                  ))}
                </div>
              </section>
            )}

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
                    {(products?.length ?? 0) === 0
                      ? t("empty.noProducts")
                      : t("empty.noMatches")}
                  </CardContent>
                </Card>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
