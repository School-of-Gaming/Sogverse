"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent } from "@/components/ui/card";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { computeProductSessions } from "@/components/calendar/compute-product-sessions";
import { SessionCalendarView } from "@/components/calendar/session-calendar-view";
import type { ProductTypeV2 } from "@/types";
import type { ProductV2DetailRow } from "@/services/products-v2";

// Gedu detail body — step one of the gedu product-details rollout
// (docs/products-redesign.md). Deliberately minimal: hero (image + name +
// type label + tagline) plus the session calendar. Mirrors the parent
// detail page's calendar card by reusing the same primitives
// (SessionCalendarView + computeProductSessions), so a future expansion
// (group rosters, staff notes, when/where info) drops in alongside this
// without rewiring.
//
// No signup panel, no pricing — gedus don't purchase. No teammates panel
// in v1; that lands when group rosters do.

interface ProductGeduDetailBodyProps {
  product: ProductV2DetailRow;
}

export function ProductGeduDetailBody({ product }: ProductGeduDetailBodyProps) {
  const uiLocale = resolveLocale(useLocale());
  const t = useTranslations("productDetail");

  const tr = resolveTranslation(product.product_translations_v2, uiLocale);

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <BackLink productType={product.product_type} />

        <div className="mt-6 grid grid-cols-[96px_1fr] items-start gap-x-4 gap-y-3 sm:grid-cols-[140px_1fr] sm:gap-x-6">
          <ProductThumbnail
            imagePath={product.image_path ?? ""}
            alt={tr?.name ?? ""}
            size="aspect-square w-full"
            className="rounded-lg [&>img]:aspect-square [&>img]:h-full [&>img]:w-full [&>img]:object-cover"
          />

          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t(`typeLabel.${product.product_type}`)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {tr?.name}
            </h1>
            {tr?.description && (
              <p className="mt-2 hidden text-muted-foreground sm:block">
                {tr.description}
              </p>
            )}
          </div>

          {tr?.description && (
            <p className="col-span-2 text-muted-foreground sm:hidden">
              {tr.description}
            </p>
          )}
        </div>

        <div className="mt-8">
          <CalendarCard product={product} />
        </div>
      </div>
    </div>
  );
}

function BackLink({ productType }: { productType: ProductTypeV2 }) {
  const t = useTranslations("productDetail.back");
  const href = backHref(productType);
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {t(productType)}
    </Link>
  );
}

function backHref(productType: ProductTypeV2): string {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return "/clubs";
    case "camp":
      return "/camps";
    case "event":
      return "/events";
  }
}

// Mirrors the calendar card on the parent detail body. Same primitives —
// pulling them into a shared component is overkill for two callers; if a
// third lands we can lift.
function CalendarCard({ product }: { product: ProductV2DetailRow }) {
  const t = useTranslations("productDetail.sections");
  const uiLocale = resolveLocale(useLocale());

  const result = computeProductSessions({
    productType: product.product_type,
    startDate: product.start_date,
    endDate: product.end_date,
    scheduleSlots: product.schedule_slots_v2,
    holidays: product.holidays,
  });
  if (!result) return null;

  // "Today" must be derived from the product's timezone — using UTC would
  // land on the wrong day for any non-UTC viewer near midnight. See
  // CLAUDE.md "Date & Time".
  const todayIso = formatInTimeZone(new Date(), product.timezone, "yyyy-MM-dd");

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("calendar")}
        </h2>
        <div className="mt-4">
          <SessionCalendarView
            rangeStart={result.rangeStart}
            rangeEnd={result.rangeEnd}
            sessions={result.sessions}
            skips={result.skips}
            locale={uiLocale}
            todayIso={todayIso}
          />
        </div>
      </CardContent>
    </Card>
  );
}
