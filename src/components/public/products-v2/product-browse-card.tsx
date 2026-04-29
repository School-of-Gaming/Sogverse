"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useCurrency } from "@/providers/currency-provider";
import type { ProductV2BrowseRow } from "@/types";
import { formatProductPrice } from "./format-product-price";
import { formatProductSchedule } from "./format-product-schedule";

interface ProductBrowseCardProps {
  product: ProductV2BrowseRow;
}

// One card layout for all three product types. Per-type variation lives in
// the schedule formatter (formatProductSchedule) and the price formatter
// (formatProductPrice) — the card itself just dispatches on the
// discriminated `kind` to pick the right i18n key. The "View details"
// button is intentionally non-functional this pass; the detail page is
// out of scope. We keep it visible so the card looks complete.
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

  const priceNode = (() => {
    switch (price.kind) {
      case "free":
        return (
          <span className="text-sm font-semibold text-primary">
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
        return (
          <div className="flex flex-col text-xs leading-tight">
            <span className="font-semibold text-foreground">
              {t("fromPerSession", { price: price.perSession })}
            </span>
            <span className="text-muted-foreground">
              {t("fromPerMonth", { price: price.perMonth })}
            </span>
          </div>
        );
      case "upfront":
        return (
          <span className="text-sm font-semibold text-foreground">
            {t("fromUpfront", { price: price.total })}
          </span>
        );
      case "unavailable":
        return (
          <span className="text-xs text-muted-foreground">
            {t("notAvailableInCurrency", { currency: price.currency })}
          </span>
        );
    }
  })();

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="relative aspect-video bg-muted">
        {product.image_path ? (
          <ProductThumbnail
            imagePath={product.image_path}
            alt={tr?.name ?? ""}
            size="h-full w-full"
            className="absolute inset-0 [&>img]:h-full [&>img]:w-full [&>img]:max-h-full [&>img]:max-w-full [&>img]:rounded-none [&>img]:object-cover"
          />
        ) : null}
        {topicTr?.name && (
          <Badge
            variant="secondary"
            className="absolute right-2 top-2 shadow"
          >
            {topicTr.name}
          </Badge>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="line-clamp-2 text-base font-semibold">
            {tr?.name ?? ""}
          </h3>
          {tr?.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {tr.description}
            </p>
          )}
        </div>

        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {scheduleLine && <li>{scheduleLine}</li>}
          <li>{t("ages", { min: product.min_age, max: product.max_age })}</li>
        </ul>

        <ProductTagChips product={product} uiLocale={uiLocale} />

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          {priceNode}
          <Button
            type="button"
            size="sm"
            variant="outline"
            // Detail page is out of scope this pass — keep the visual CTA
            // but make the click a no-op so we don't link to a non-existent
            // /clubs/[slug] route.
            onClick={() => {
              /* noop: detail page lands in a follow-up */
            }}
          >
            {t("viewDetails")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
