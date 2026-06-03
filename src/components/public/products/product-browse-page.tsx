"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  useMyGeduAssignedProducts,
  useVisibleProductsByTypes,
  useTopics,
  useTags,
} from "@/services/products";
import {
  useParticipationCounts,
  type ParticipationCounts,
} from "@/services/participations";
import { useAuth } from "@/providers/auth-provider";
import type { ProductType } from "@/types";
import { filterProducts } from "./filter-products";
import { useBrowseFilters } from "./use-browse-filters";
import { SHOP_PRODUCT_TYPES } from "./use-shop-category";
import { ProductBrowseCard } from "./product-browse-card";
import { ProductBrowseFilters } from "./product-browse-filters";
import { ProductGeduAssignedCard } from "./product-gedu-assigned-card";

interface ProductBrowsePageProps {
  /** Single type rendered in the browse grid (and the gedu-assigned rail). */
  browseType: ProductType;
}

// Heading + subheading copy live under productBrowse.headings/subheadings,
// keyed on the browseType. We resolve to literal keys here (rather than
// templating with the type name) so next-intl's typed t() call narrows
// to a known message path. Municipality clubs have no browse route; mapping
// the type to the consumer-club copy is harmless and keeps the switch total.
type HeadingKey = "consumer_club" | "camp" | "event";
const HEADING_KEYS: Record<ProductType, HeadingKey> = {
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

function geduAssignedHeadingFor(
  t: ReturnType<typeof useTranslations<"productBrowse">>,
  key: HeadingKey,
): string {
  switch (key) {
    case "consumer_club":
      return t("geduAssignedHeadings.consumer_club");
    case "camp":
      return t("geduAssignedHeadings.camp");
    case "event":
      return t("geduAssignedHeadings.event");
  }
}

export function ProductBrowsePage({ browseType }: ProductBrowsePageProps) {
  const t = useTranslations("productBrowse");
  const { profile, isLoading: authLoading } = useAuth();
  const isGedu = profile?.role === "gedu";

  // Load every shop-surfaced type in one fetch; the selected browseType is
  // applied client-side below, so switching the Type filter is instant (no
  // refetch). Counts (keyed on these ids) likewise cover all types at once.
  const { data: products, isLoading: productsLoading } =
    useVisibleProductsByTypes(SHOP_PRODUCT_TYPES);
  // The filter chips read from the same topics/tags queries — wait on them
  // too so the filter row appears with chips the first time it shows up
  // (avoids a brief "Topic: " empty row on cold cache).
  const { isLoading: topicsLoading } = useTopics();
  const { isLoading: tagsLoading } = useTags();

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

  // Gedu rail: products this gedu is assigned to (via gedu_group_assignments),
  // filtered to this page's browse type. Parents have no parallel rail — every
  // product (owned or not) renders the same way in the browse grid below.
  // Clicking a rail card navigates to the same /shop/[id] route a parent uses,
  // where the detail page branches on role.
  const { data: geduAssignedProducts, isLoading: geduAssignedLoading } =
    useMyGeduAssignedProducts({ enabled: isGedu });
  const geduAssignedRows = useMemo(() => {
    if (!geduAssignedProducts) return [];
    return geduAssignedProducts.filter((p) => p.product_type === browseType);
  }, [geduAssignedProducts, browseType]);

  // Hide a gedu's assigned products from the browse grid: their single entry
  // point to a product they teach is the rail above. Parents get no such
  // exclusion — an owned product is just another browse card. The set spans
  // all assigned types rather than the type-filtered rows; including other-type
  // ids is harmless since the grid only renders browseType products.
  const assignedProductIds = useMemo(() => {
    const ids = new Set<string>();
    if (isGedu) {
      for (const p of geduAssignedProducts ?? []) ids.add(p.id);
    }
    return ids;
  }, [isGedu, geduAssignedProducts]);

  // Wait on every query the page renders before painting anything — including
  // counts. Without this gate the browse grid lands first, the gedu rail pops
  // in above it and shoves the grid down (CLAUDE.md layout-shift rule). The
  // gedu-assigned query only runs for gedus (see the `enabled` gating above);
  // for parents it resolves immediately.
  const allLoaded =
    !authLoading &&
    !productsLoading &&
    !topicsLoading &&
    !tagsLoading &&
    !geduAssignedLoading &&
    !countsLoading;

  // The Type filter is just a client-side narrowing of the all-types fetch to
  // the selected browseType. Topic/tag/format/language filters apply on top.
  const typeProducts = useMemo(
    () => (products ?? []).filter((p) => p.product_type === browseType),
    [products, browseType],
  );

  const { topics, tags, format, languages } = useBrowseFilters();
  const filtered = useMemo(() => {
    const base = filterProducts(typeProducts, { topics, tags, format, languages });
    if (assignedProductIds.size === 0) return base;
    return base.filter((p) => !assignedProductIds.has(p.id));
  }, [typeProducts, topics, tags, format, languages, assignedProductIds]);

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
            {isGedu && geduAssignedRows.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">
                  {geduAssignedHeadingFor(t, headingKey)}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {geduAssignedRows.map((p) => (
                    <ProductGeduAssignedCard key={p.id} product={p} />
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
                    {typeProducts.length === 0
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
