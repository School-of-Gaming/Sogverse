"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { ParticipationCounts } from "@/services/participations";
import type { TopicFilterChip } from "@/lib/products/topics";
import type { ProductBrowseRow, SpokenLanguage } from "@/types";
import { filterProducts } from "./filter-products";
import { useBrowseFilters } from "./use-browse-filters";
import { ProductBrowseCard } from "./product-browse-card";
import { ProductBrowseFilters } from "./product-browse-filters";

// The shared body of a browse page: the filter strip, the card grid, and the
// empty states. The shop (one product type at a time) and the per-municipality
// page (one municipality's clubs) both render this — they differ only in the
// header above it, how they narrow `products` to their scope, and the filter
// config they pass down. Keeping the chip-filtering + grid here is what stops
// the two pages from drifting.
interface ProductBrowseResultsProps {
  /** Products already narrowed to this page's scope (a product type for the
   *  shop, a municipality for the schools page), before the chip filters run. */
  products: ProductBrowseRow[];
  /** Seat counts for `products` (any order). Built into a per-id map here so
   *  both browse hosts hand this component the raw query result, not a map. */
  counts: ParticipationCounts[];
  /** Whether the Days filter applies to this scope — the single source for it.
   *  Drives `filterProducts` here and, forwarded as `daysFilter`, the filter
   *  strip's Days row. Clubs are recurring-weekly; camps are not. */
  supportsDays: boolean;
  /** Forwarded verbatim to `<ProductBrowseFilters>`. The Days flag is *not*
   *  here — it's derived from `supportsDays` so the two can't drift. */
  filters: {
    initialSpokenLanguages: SpokenLanguage[];
    showTypeFilter?: boolean;
    topicChoices?: readonly TopicFilterChip[];
    topicLabelKey?: "topic" | "subject";
  };
  /** Detail-page URL builder for each card. Defaults to the storefront
   *  `/shop/[id]`; the municipality page passes `/schools/<slug>/[id]`. */
  productHref?: (id: string) => string;
  /** True on a single-municipality page — drops the redundant municipality name
   *  from online muni cards (see `ProductBrowseCard`). */
  municipalityScoped?: boolean;
}

export function ProductBrowseResults({
  products,
  counts,
  supportsDays,
  filters,
  productHref,
  municipalityScoped,
}: ProductBrowseResultsProps) {
  const t = useTranslations("productBrowse");
  const { topics, format, languages, age, days } = useBrowseFilters();

  const countsByProduct = useMemo(() => {
    const map = new Map<string, ParticipationCounts>();
    for (const c of counts) {
      map.set(c.productId, c);
    }
    return map;
  }, [counts]);

  // Days is a Clubs-only filter (recurring weekly schedule); drop a stale
  // `?days=` when this scope doesn't support it — see filter-products.ts.
  const filtered = useMemo(
    () =>
      filterProducts(products, {
        topics,
        format,
        languages,
        age,
        days: supportsDays ? days : [],
      }),
    [products, topics, format, languages, age, days, supportsDays],
  );

  return (
    <section className="space-y-3">
      <ProductBrowseFilters {...filters} daysFilter={supportsDays} />

      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProductBrowseCard
              key={p.id}
              product={p}
              counts={countsByProduct.get(p.id) ?? null}
              detailHref={productHref?.(p.id)}
              municipalityScoped={municipalityScoped}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {products.length === 0
              ? t("empty.noProducts")
              : t("empty.noMatches")}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
