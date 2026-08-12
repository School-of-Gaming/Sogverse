"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
// A fourth column was tried (an 87rem cap stepping in at 110rem) and reverted:
// four readable columns put the cards block at ~1390px, which reads too wide
// on an ordinary desktop — don't re-add it by widening this cap alone.
// Both gutters are `1fr`, so once each can exceed the rail's 16rem floor —
// viewport ≥ ~1616px — they equalise and the cards sit dead centre of the
// viewport. Below that the left gutter is at its floor and the right takes
// what is left, so the cards sit right of centre: +128px at 1024 and 1280,
// +88px at 1440, 0 from ~1616 up. That asymmetry is the tolerance we accepted
// — true centring at 1440 would mean two 16rem gutters and three cards of
// ~267px, and legibility beats symmetry. Checked at 1024 / 1280 / 1440 / 1616
// / 1920.
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
  /** Whether the page's scope holds any products before *any* filtering —
   *  including the Type narrowing the shop applies while building `sections`.
   *  Distinguishes "nothing here yet" from "no matches": without it, selecting
   *  a type the catalog lacks would read as an empty catalog even though the
   *  lit Type chip is the cause. Omitted where `sections` already carry the
   *  whole scope (the municipality page). */
  scopeHasProducts?: boolean;
  /** Detail-page URL builder for each card. Defaults to the storefront
   *  `/shop/[id]`; the municipality page passes `/schools/<slug>/[id]`. */
  productHref?: (id: string) => string;
  /** True on a single-municipality page — drops the redundant municipality name
   *  from online muni cards (see `ProductBrowseCard`). */
  municipalityScoped?: boolean;
  /**
   * Substitutes the card each grid cell renders. Defaults to the live
   * `<ProductBrowseCard>`, which is what both real browse surfaces get.
   *
   * **This exists for the draft-card preview and is removed at promotion.** The
   * shop scene's redesign scenario renders the draft body over these same rows,
   * in this same grid, at these same widths — which is the only honest way to
   * judge a card redesign, since a card is judged against its neighbours. A
   * callback rather than a variant prop, so nothing about the draft card leaks
   * into this component's types; the callback owns whatever extra props its
   * adapter needs (the tag, the demo image), and this component keeps owning
   * the key.
   *
   * It is handed **everything** the default card is given, `municipalityScoped`
   * included — which today's only caller ignores, since the shop scene is not a
   * municipality page. Withholding it would make the seam quietly lossy the
   * moment anything on the `/schools` surface reached for it.
   */
  renderCard?: (
    product: ProductBrowseRow,
    counts: ParticipationCounts | null,
    detailHref: string | undefined,
    municipalityScoped: boolean | undefined,
  ) => ReactNode;
}

export function ProductBrowseResults({
  sections,
  counts,
  filters,
  scopeHasProducts,
  productHref,
  municipalityScoped,
  renderCard,
}: ProductBrowseResultsProps) {
  const t = useTranslations("productBrowse");
  // The empty state's clear affordance is the rail's button in another place,
  // so it reuses that button's label rather than authoring a second word for
  // the same action.
  const tFilters = useTranslations("productBrowse.filters");
  const { topics, format, languages, audiences, age, days, clear } =
    useBrowseFilters();

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
            audiences,
            age,
            days,
          }),
        }))
        .filter((section) => section.products.length > 0),
    [sections, topics, format, languages, audiences, age, days],
  );

  // "Nothing here yet" vs "no matches" is decided before *all* filtering, Type
  // included — hence the host-provided `scopeHasProducts` where sections arrive
  // already Type-narrowed (the shop). Falling back to the sections is only
  // right where they carry the whole scope (the municipality page).
  const hasProducts =
    scopeHasProducts ??
    sections.some((section) => section.products.length > 0);

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
                  the track caps out); two columns below it run 336–463px. Three
                  is also the ceiling — a fourth column was tried and reverted,
                  see the width-budget comment on the root element. */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {section.products.map((p) => {
                  const cardCounts = countsByProduct.get(p.id) ?? null;
                  const href = productHref?.(p.id);
                  return (
                    // The Fragment is what keeps the key here rather than in a
                    // caller's callback; it renders no element of its own, so
                    // the grid is byte-for-byte what it was on the live path.
                    <Fragment key={p.id}>
                      {renderCard ? (
                        renderCard(p, cardCounts, href, municipalityScoped)
                      ) : (
                        <ProductBrowseCard
                          product={p}
                          counts={cardCounts}
                          detailHref={href}
                          municipalityScoped={municipalityScoped}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* No box: a card is a container for something, and an empty grid has
           nothing for it to contain — the border only draws attention to the
           absence. Plain centred text in the cards track instead, with the
           vertical room a grid of cards would have had so the page doesn't
           collapse to a strip under the filters. Nothing survives the swap
           between the grid and this (or between its two messages), so there is
           no position to preserve. */
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {hasProducts ? t("empty.noMatches") : t("empty.noProducts")}
          </p>
          {/* Only on "no matches": the filters are what hid the cards, so the
              rail's own Clear — the same `clear` from the same hook — is worth
              repeating where the reader is actually looking. On an empty scope
              there is nothing for it to reveal, and a button that changes
              nothing is a control lying. */}
          {hasProducts && (
            <Button
              type="button"
              variant="link"
              // `sm` for the 36px tap target a phone wants, with the body's
              // text size back on top of it — the size's own `text-xs` reads
              // as fine print under a line it is the answer to.
              size="sm"
              className="mt-1 text-sm"
              onClick={clear}
            >
              {tFilters("clearAll")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
