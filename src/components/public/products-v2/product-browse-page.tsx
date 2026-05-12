"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  useMyGeduAssignedProducts,
  useVisibleProductsV2ByType,
  useTopicsV2,
  useTagsV2,
} from "@/services/products-v2";
import {
  useMyParticipations,
  useParticipationCounts,
  type ParticipationCounts,
} from "@/services/participations";
import { useAuth } from "@/providers/auth-provider";
import type { ProductTypeV2 } from "@/types";
import { filterProducts } from "./filter-products";
import { useBrowseFilters } from "./use-browse-filters";
import { ProductBrowseCard } from "./product-browse-card";
import { ProductBrowseFilters } from "./product-browse-filters";
import { ProductGeduAssignedCard } from "./product-gedu-assigned-card";
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

export function ProductBrowsePage({
  browseType,
  purchasedTypes,
}: ProductBrowsePageProps) {
  const t = useTranslations("productBrowse");
  const { profile, isLoading: authLoading } = useAuth();
  const isGedu = profile?.role === "gedu";

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
  const { data: counts, isLoading: countsLoading } =
    useParticipationCounts(productIds);
  const countsByProduct = useMemo(() => {
    const map = new Map<string, ParticipationCounts>();
    for (const c of counts ?? []) {
      map.set(c.productId, c);
    }
    return map;
  }, [counts]);

  // Real "your enrolled" rail (replaces the prior ?mock=1 gate).
  // Gedus don't have participations — their parallel rail is driven by
  // gedu_group_assignments_v2 (see useMyGeduAssignedProducts below).
  const { data: myParticipations, isLoading: myParticipationsLoading } =
    useMyParticipations({ enabled: !isGedu });
  const purchasedRows = useMemo(() => {
    if (!myParticipations) return [];
    return myParticipations.filter(
      (p) =>
        p.product !== null && purchasedTypes.includes(p.product.product_type),
    );
  }, [myParticipations, purchasedTypes]);

  // Gedu rail: products this gedu is assigned to (via gedu_group_assignments_v2).
  // Parallel to the parent's purchased rail above; filtered to the types this
  // page surfaces. Step one of the gedu products v2 rollout — clicking a card
  // navigates to the same /clubs/[id] (or /camps, /events) route the parent
  // uses, where the detail page branches on role.
  const { data: geduAssignedProducts, isLoading: geduAssignedLoading } =
    useMyGeduAssignedProducts({ enabled: isGedu });
  const geduAssignedRows = useMemo(() => {
    if (!geduAssignedProducts) return [];
    return geduAssignedProducts.filter((p) =>
      purchasedTypes.includes(p.product_type),
    );
  }, [geduAssignedProducts, purchasedTypes]);

  // Hide already-owned products from the browse grid below: the user's
  // single entry point to a product they own is the rail above. For parents,
  // "owned" = an active/waitlisted participation. For gedus, "owned" = an
  // assignment row. Multi-gamer households still see one purchased card per
  // gamer; the set dedupes by product id for the exclusion. We exclude on
  // the full list (across types) rather than the type-filtered rows so a
  // parent who bought a club can't see it linger in a different browse grid
  // either.
  const purchasedProductIds = useMemo(() => {
    const ids = new Set<string>();
    if (isGedu) {
      for (const p of geduAssignedProducts ?? []) ids.add(p.id);
    } else {
      for (const p of myParticipations ?? []) {
        if (p.product !== null) ids.add(p.product.id);
      }
    }
    return ids;
  }, [isGedu, myParticipations, geduAssignedProducts]);

  // Wait on every query the page renders before painting anything — including
  // myParticipations + counts. Without this gate the browse grid lands first,
  // the purchased rail pops in above it and shoves the grid down (CLAUDE.md
  // layout-shift rule), and a parent gets a brief glimpse of an
  // already-purchased product as a browse card before it's filtered out.
  // Gedu role waits on the gedu-assigned query instead of myParticipations
  // (those are mutually exclusive — see the `enabled` gating above).
  const allLoaded =
    !authLoading &&
    !productsLoading &&
    !topicsLoading &&
    !tagsLoading &&
    !myParticipationsLoading &&
    !geduAssignedLoading &&
    !countsLoading;

  const { topics, tags, format, languages } = useBrowseFilters();
  const filtered = useMemo(() => {
    const base = filterProducts(products ?? [], { topics, tags, format, languages });
    if (purchasedProductIds.size === 0) return base;
    return base.filter((p) => !purchasedProductIds.has(p.id));
  }, [products, topics, tags, format, languages, purchasedProductIds]);

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

            {!isGedu && purchasedRows.length > 0 && (
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
