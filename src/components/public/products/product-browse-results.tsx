"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { ParticipationCounts } from "@/services/participations";
import type { ProductBrowseRow, SpokenLanguage } from "@/types";
import { filterProducts } from "./filter-products";
import { useBrowseFilters } from "./use-browse-filters";
import { ProductBrowseCard } from "./product-browse-card";
import { ProductBrowseFilters } from "./product-browse-filters";

/** One headed block of cards. The shop passes one per visible category (Clubs →
 *  Camps → Events, in that fixed order); the municipality page passes a single
 *  unheaded one, which renders as a plain grid. */
export interface ProductBrowseSection {
  /** Stable identity for the block — the shop uses the category name. */
  id: string;
  /** The block's h2. Omitted where the page's own h1 already names the scope
   *  (the municipality page), so the grid stands alone with no redundant
   *  heading above it. */
  heading?: string;
  /** Products in this block, before the chip filters run. */
  products: ProductBrowseRow[];
}

// The shared body of a browse page: the filter rail/strip, the headed card
// grids, and the empty states. The shop (a section per visible product
// category) and the per-municipality page (one municipality's clubs) both
// render this — they differ only in the sections they hand over and the filter
// config they pass down. Keeping the chip-filtering + grids here is what stops
// the two pages from drifting.
//
// Layout: one column on phones (filter strip on top, cards below), a rail
// beside the cards from `lg` up. There is only ever one instance of the filter
// component — it restyles itself at `lg` instead of a second copy being
// rendered for the rail.
//
// The horizontal width budget lives here rather than in the two hosts, so both
// browse surfaces are the same shape by construction. Below `lg` this is the
// ordinary centred page container. From `lg` it drops that cap (`max-w-none`
// overrides `container`'s breakpoint max-widths) and spends the viewport on
// three tracks — left gutter, cards, right gutter — with the 16rem rail pinned
// to the right edge of the left gutter so it sits against the cards. Only two
// children are placed, so auto-placement fills tracks 1 and 2 and the third
// stays the empty gutter that makes the centring work; a third child would land
// in it.
//
// The cards track caps at 64rem (`5xl`): three columns of ~330px, a shade wider
// than the ~312px the capped-container layout gave at 1440. A larger cap (6xl)
// pushes a three-column card past 370px and the grid starts reading as a list.
// Both gutters are `1fr`, so once each can exceed the rail's
// 16rem floor — viewport ≥ ~1616px — they equalise and the cards sit dead
// centre of the viewport. Below that the left gutter is at its floor and the
// right takes what is left, so the cards sit right of centre: +128px at 1024
// and 1280, +88px at 1440, 0 from ~1616 up. That asymmetry is the tolerance we
// accepted — true centring at 1440 would mean two 16rem gutters and three cards
// of ~267px, and legibility beats symmetry. Checked at 1024 / 1280 / 1440 /
// 1920.
interface ProductBrowseResultsProps {
  /** Sections to render, in display order. A section whose products all fail
   *  the chip filters disappears rather than rendering an empty shell. */
  sections: ProductBrowseSection[];
  /** Seat counts covering every section's products (any order). Built into a
   *  per-id map here so both browse hosts hand this component the raw query
   *  result, not a map. */
  counts: ParticipationCounts[];
  /** Forwarded verbatim to `<ProductBrowseFilters>`. */
  filters: {
    initialSpokenLanguages: SpokenLanguage[];
    showTypeFilter?: boolean;
  };
  /** Detail-page URL builder for each card. Defaults to the storefront
   *  `/shop/[id]`; the municipality page passes `/schools/<slug>/[id]`. */
  productHref?: (id: string) => string;
  /** True on a single-municipality page — drops the redundant municipality name
   *  from online muni cards (see `ProductBrowseCard`). */
  municipalityScoped?: boolean;
}

export function ProductBrowseResults({
  sections,
  counts,
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

  // A section that survives the chip filters with nothing left is dropped
  // outright — an empty heading over an empty grid says less than its absence
  // does, and the removal is the direct result of the tap that caused it.
  const visibleSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          products: filterProducts(section.products, {
            topics,
            format,
            languages,
            age,
            days,
          }),
        }))
        .filter((section) => section.products.length > 0),
    [sections, topics, format, languages, age, days],
  );

  // "Nothing here yet" vs "no matches" is decided before the chips run: a scope
  // with no products at all can't be filtered into one.
  const hasProducts = sections.some((section) => section.products.length > 0);

  return (
    // Reserve the document scrollbar gutter: the chip filters can shrink the
    // sections back above the fold, flipping the document scrollbar off and
    // shifting the viewport-centred grid sideways — see the html:has() rule in
    // globals.css.
    <div
      className="container mx-auto px-4 lg:grid lg:max-w-none lg:grid-cols-[minmax(16rem,1fr)_minmax(0,64rem)_minmax(0,1fr)] lg:gap-6"
      data-reserve-scroll-gutter
    >
      {/* Sticks below the site header (--header-height, the same variable the
          header itself is sized from) and scrolls internally once the chip
          groups outgrow the viewport. `self-start` is what lets it stick at
          all — a stretched grid item is already as tall as its row. The
          explicit 16rem width plus `justify-self-end` keep the rail its own
          size and against the cards while its track grows past it. */}
      <div className="mb-3 lg:mb-0 lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:max-h-[calc(100vh-var(--header-height)-3rem)] lg:w-64 lg:justify-self-end lg:self-start lg:overflow-y-auto">
        <ProductBrowseFilters {...filters} />
      </div>

      {visibleSections.length > 0 ? (
        <div className="space-y-8">
          {visibleSections.map((section) => (
            <section key={section.id} className="space-y-3">
              {section.heading && (
                <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                  {section.heading}
                </h2>
              )}
              {/* Three columns only from `xl` up: at `lg` the rail and the
                  gutters leave the cards track ~688–944px, and a third column
                  there would squeeze each card under 300px. `xl` is the first
                  breakpoint where three still read (~304px at 1280, ~330px once
                  the track caps out); two columns below it run 336–463px. */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {section.products.map((p) => (
                  <ProductBrowseCard
                    key={p.id}
                    product={p}
                    counts={countsByProduct.get(p.id) ?? null}
                    detailHref={productHref?.(p.id)}
                    municipalityScoped={municipalityScoped}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {hasProducts ? t("empty.noMatches") : t("empty.noProducts")}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
