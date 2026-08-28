"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ProductBrowseCard } from "@/components/public/products/product-browse-card";
import type { ParticipationCounts } from "@/services/participations";
import type { ProductBrowseRow } from "@/types";

interface UpcomingEventsProps {
  /**
   * The programme's products, already narrowed to the programme's slice by the
   * shell above. Empty renders the empty state, which stays a real state: the
   * page ships before every cohort is scheduled.
   */
  products?: readonly ProductBrowseRow[];
  /**
   * Seat counts covering those products, in any order — the raw query result,
   * built into a per-id map here so the shell hands over what it fetched rather
   * than a map it had to assemble.
   */
  counts?: readonly ParticipationCounts[];
}

/**
 * "Upcoming Events" — the programme's own products, rendered with the
 * storefront's own card.
 *
 * Presentational by design: it takes rows and renders them, so it stays
 * demoable from fixtures and the data work lives in the shell that wraps it
 * (`upcoming-events-section.tsx` prefetches, `upcoming-events-browse.tsx` keeps
 * the query live and applies the programme narrowing).
 *
 * The card is `ProductBrowseCard`, the same component the shop grid renders,
 * not a lookalike: a family who taps through from here and a family who found
 * the same product in the shop must be reading the same card, with the same
 * schedule, price, seat and audience rules. It also owns every locale, currency
 * and timezone resolution a product row needs, which is why this file does no
 * date maths of its own — the earlier shape took pre-formatted strings for
 * exactly that reason, and the card now discharges it.
 *
 * Cards link to `/shop/[id]`, the card's own default, so the detail page a
 * reader lands on is the storefront one with its real signup panel.
 *
 * The brief asks for a carousel. This renders a plain responsive grid: a
 * horizontally-scrolling row would hide events behind an interaction on the one
 * section whose whole job is to show what is on offer.
 */
export function UpcomingEvents({
  products = [],
  counts = [],
}: UpcomingEventsProps) {
  const t = useTranslations("roblox.events");

  const countsByProduct = useMemo(() => {
    const map = new Map<string, ParticipationCounts>();
    for (const c of counts) {
      map.set(c.productId, c);
    }
    return map;
  }, [counts]);

  return (
    <section className="container mx-auto px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("heading")}
        </h2>
        <p className="mt-4 text-muted-foreground">{t("subheading")}</p>
      </div>

      {products.length === 0 ? (
        <Card className="mx-auto mt-12 max-w-2xl bg-card/50">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="max-w-md text-muted-foreground">{t("empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductBrowseCard
              key={product.id}
              product={product}
              counts={countsByProduct.get(product.id) ?? null}
            />
          ))}
        </div>
      )}
    </section>
  );
}
