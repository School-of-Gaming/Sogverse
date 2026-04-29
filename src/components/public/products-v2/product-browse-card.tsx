"use client";

import { useLocale, useTranslations } from "next-intl";
import { Users, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/providers/currency-provider";
import type { ProductV2BrowseRow } from "@/types";
import { effectiveStatus } from "@/components/admin/products-v2/effective-status";
import { formatProductPrice } from "./format-product-price";
import { formatProductSchedule } from "./format-product-schedule";

interface ProductBrowseCardProps {
  product: ProductV2BrowseRow;
}

// Info-dense card with a 1:1 thumbnail on the left and the meaningful
// info — schedule, seats, ages, tags, price — to the right. Matches the
// thumbnail-and-content layout used in admin/product-row.tsx so product
// images are consistently square across the app.
//
// Helper functions are inlined here so they can call the bound `t` from
// the closure rather than receive it as a parameter — passing
// `ReturnType<typeof useTranslations>` across function boundaries trips
// next-intl's typed-message-key inference into TS2589 ("excessively
// deep") on this path.
export function ProductBrowseCard({ product }: ProductBrowseCardProps) {
  const t = useTranslations("productBrowse.card");
  const uiLocale = resolveLocale(useLocale());
  const { currency } = useCurrency();

  const tr = resolveTranslation(product.product_translations_v2, uiLocale);
  const topicTr = resolveTranslation(
    product.topics_v2?.topic_translations_v2,
    uiLocale,
  );

  const status = effectiveStatus(product, new Date(), 0);
  const hasEnded = status === "completed" || status === "expired";

  const schedule = formatProductSchedule({ product, locale: uiLocale });
  const price = formatProductPrice({
    prices: product.product_prices_v2,
    billingMode: product.billing_mode,
    productType: product.product_type,
    currency,
    locale: uiLocale,
  });

  const scheduleLine = (() => {
    switch (schedule.kind) {
      case "every": {
        const main = t("scheduleEvery", {
          day: schedule.day,
          time: schedule.time,
        });
        return schedule.tz
          ? `${main} ${t("tzNote", { tz: schedule.tz })}`
          : main;
      }
      case "range": {
        const main = t("scheduleRange", {
          startDate: schedule.startDate,
          endDate: schedule.endDate,
        });
        return schedule.tz
          ? `${main} ${t("tzNote", { tz: schedule.tz })}`
          : main;
      }
      case "single": {
        const main = t("scheduleSingle", {
          date: schedule.date,
          time: schedule.time,
        });
        return schedule.tz
          ? `${main} ${t("tzNote", { tz: schedule.tz })}`
          : main;
      }
      case "tbd":
        return "";
    }
  })();

  return (
    <Card
      className={cn(
        "flex h-full flex-col overflow-hidden transition-colors",
        hasEnded && "opacity-70 grayscale-[40%]",
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex gap-3">
          <ProductThumbnail
            imagePath={product.image_path ?? ""}
            alt={tr?.name ?? ""}
            size="h-20 w-20 sm:h-24 sm:w-24"
            className={cn(
              "rounded-md bg-muted [&>img]:aspect-square [&>img]:h-full [&>img]:w-full [&>img]:object-cover",
              !product.image_path && "[&>img]:hidden",
            )}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start gap-2">
              <h3 className="line-clamp-2 flex-1 text-sm font-semibold sm:text-base">
                {tr?.name ?? ""}
              </h3>
              {hasEnded && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {t("endedBadge")}
                </Badge>
              )}
            </div>

            {topicTr?.name && (
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                {topicTr.name}
              </p>
            )}

            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {scheduleLine && <li className="line-clamp-1">{scheduleLine}</li>}
              <li className="flex flex-wrap items-center gap-x-2">
                <span>{t("ages", { min: product.min_age, max: product.max_age })}</span>
                <SeatsHint product={product} />
              </li>
            </ul>
          </div>
        </div>

        {tr?.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {tr.description}
          </p>
        )}

        <ProductTagChips product={product} uiLocale={uiLocale} />

        <div className="mt-auto border-t pt-3">
          {hasEnded ? (
            <p className="text-xs italic text-muted-foreground">
              {t("endedNote")}
            </p>
          ) : (
            <div className="flex items-end justify-between gap-2">
              <PriceBlock price={price} />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  /* noop: detail page lands in a follow-up */
                }}
              >
                {t("viewDetails")}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SeatsHint({ product }: { product: ProductV2BrowseRow }) {
  const t = useTranslations("productBrowse.card");
  if (product.seat_count !== null) {
    return (
      <span className="inline-flex items-center gap-1">
        <Users className="h-3 w-3" aria-hidden />
        {t("seatsCapacity", { count: product.seat_count })}
      </span>
    );
  }
  if (product.waitlist_enabled) {
    return (
      <span className="inline-flex items-center gap-1">
        <Hourglass className="h-3 w-3" aria-hidden />
        {t("waitlistAvailable")}
      </span>
    );
  }
  return null;
}

function PriceBlock({
  price,
}: {
  price: ReturnType<typeof formatProductPrice>;
}) {
  const t = useTranslations("productBrowse.card");

  switch (price.kind) {
    case "free":
      return (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {t("free")}
        </span>
      );
    case "external":
      return (
        <span className="text-xs text-muted-foreground">
          {t("externalContract")}
        </span>
      );
    case "bundle_or_sub":
      // Two distinct billing models — pay-per-session for flexibility,
      // monthly subscription for commitment (often a better effective
      // rate). The explicit "or" divider with hairlines makes the
      // alternative clear; without it, two stacked prices read as a
      // single thing in two formats.
      return (
        <div className="flex flex-col items-start gap-1 leading-tight">
          <span className="text-sm font-semibold text-foreground">
            {t("perSession", { price: price.perSession })}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span aria-hidden className="h-px w-3 bg-border" />
            {t("orChoice")}
            <span aria-hidden className="h-px w-3 bg-border" />
          </span>
          <span className="text-sm font-semibold text-foreground">
            {t("perMonth", { price: price.perMonth })}
          </span>
        </div>
      );
    case "upfront":
      return (
        <span className="text-base font-semibold text-foreground">
          {t("upfrontTotal", { price: price.total })}
        </span>
      );
    case "unavailable":
      return (
        <span className="text-xs text-muted-foreground">
          {t("notAvailableInCurrency", { currency: price.currency })}
        </span>
      );
  }
}

function ProductTagChips({
  product,
  uiLocale,
}: {
  product: ProductV2BrowseRow;
  uiLocale: SupportedLocale;
}) {
  const tagLabels = product.product_tags_v2
    .map((pt) => {
      if (!pt.tags_v2) return null;
      const tr = resolveTranslation(pt.tags_v2.tag_translations_v2, uiLocale);
      return tr?.name ?? pt.tags_v2.slug;
    })
    .filter((s): s is string => Boolean(s));

  if (tagLabels.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {tagLabels.map((label) => (
        <Badge key={label} variant="outline" className="text-[10px]">
          {label}
        </Badge>
      ))}
    </div>
  );
}
