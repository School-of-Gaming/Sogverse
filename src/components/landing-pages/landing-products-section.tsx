"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ProductRail } from "@/components/public/products/product-rail";
import type {
  ProductRailSeed,
  ProductRailSelection,
} from "@/components/public/products/product-rail-selection";
import { useProductRail } from "@/components/public/products/use-product-rail";
import { cn } from "@/lib/cn";
import { LANDING_SECTION, SectionHeader, hasSectionHeader } from "./landing-section-header";

interface LandingProductsSectionProps {
  /** The admin's picks, in their order. */
  productIds: readonly string[];
  eyebrow?: string;
  heading?: string;
  intro?: string;
  /** The page's prefetch, narrowed to this section (`productRailSeed`). */
  seed: ProductRailSeed;
}

/**
 * **A products section: the admin's picks as the shop's own cards**, in the
 * shared product rail — `ProductBrowseCard` through `ProductRail`, never a
 * lookalike — so every name, schedule, age, price, seat count and registration
 * state on it is the shop's, live. Each card links to the product's shop page,
 * the card's own default.
 *
 * **The shop's listing decides what is drawn.** The picks are a selection of
 * that listing (`selectRailProducts`), so a pick that has ended, been unlisted
 * or is not a product the shop sells is simply not drawn, and a section whose
 * picks are none of them listed draws nothing at all — no heading over an
 * empty rail, no empty state: an admin promoting last term's camp has made a
 * mistake the status page reports, not a state a reader should be shown.
 *
 * **It paints on the first frame.** The page prefetches the listing on the
 * server before its HTML is sent, with no Suspense boundary — the Roblox
 * page's trade, and for the same reason: a fallback would have to hold this
 * section's exact final height, and whether the section is drawn at all is
 * only known from the data. So the cards, or the section's absence, are in the
 * server's HTML and nothing below moves when the page hydrates. The one path
 * that moves anything is a failed prefetch, which seeds nothing: the live
 * query fetches on mount and the section appears when it lands, the shift the
 * pipeline accepts on that anomalous path alone.
 */
export function LandingProductsSection({
  productIds,
  eyebrow,
  heading,
  intro,
  seed,
}: LandingProductsSectionProps) {
  const t = useTranslations("productBrowse.rail");
  const selection = useMemo<ProductRailSelection>(
    () => ({ kind: "picks", productIds }),
    [productIds],
  );
  const { products, counts } = useProductRail(selection, seed);
  if (products.length === 0) return null;

  return (
    <section className={LANDING_SECTION}>
      <SectionHeader eyebrow={eyebrow} heading={heading} intro={intro} />
      <div className={cn(hasSectionHeader({ eyebrow, heading, intro }) && "mt-12")}>
        <ProductRail
          products={products}
          counts={counts}
          labels={{ previous: t("previous"), next: t("next") }}
        />
      </div>
    </section>
  );
}
