"use client";

import { useLocale, useTranslations } from "next-intl";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useCurrency } from "@/providers/currency-provider";
import type { ProductV2BrowseRow } from "@/types";
import { deriveRegistrationState } from "./derive-registration-state";
import { formatProductPrice } from "./format-product-price";
import { formatProductSchedule } from "./format-product-schedule";
import {
  ProductBrowseCardView,
  type SeatsHint,
} from "./product-browse-card-view";

interface ProductBrowseCardProps {
  product: ProductV2BrowseRow;
}

// Adapter: resolves a `ProductV2BrowseRow` into the display props
// `ProductBrowseCardView` consumes. All locale / currency / time /
// participation lookups happen here so the View stays purely
// presentational — that's what lets the UI Components page render every
// state by hand without forging a full BrowseRow.
//
// Helper functions for schedule-line text are inlined inside the
// component so they can use the closure-bound `t` — passing
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

  // Pre-`participations_v2`, every product reports zero active
  // participations. The deriver handles the today-vs-future degradation
  // (see derive-registration-state.ts) — when the count goes live the
  // richer states light up automatically.
  const state = deriveRegistrationState({
    product,
    now: new Date(),
    participationsCount: 0,
  });

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

  const seatsHint: SeatsHint | null =
    product.seat_count !== null
      ? { kind: "capacity", count: product.seat_count }
      : product.waitlist_enabled
        ? { kind: "waitlist" }
        : null;

  return (
    <ProductBrowseCardView
      name={tr?.name ?? ""}
      description={tr?.description ?? null}
      imagePath={product.image_path}
      topicLabel={topicTr?.name ?? null}
      scheduleLine={scheduleLine}
      ageLine={t("ages", { min: product.min_age, max: product.max_age })}
      seatsHint={seatsHint}
      tagLabels={resolveTagLabels(product, uiLocale)}
      price={price}
      state={state}
    />
  );
}

function resolveTagLabels(
  product: ProductV2BrowseRow,
  uiLocale: SupportedLocale,
): string[] {
  return product.product_tags_v2
    .map((pt) => {
      if (!pt.tags_v2) return null;
      const tr = resolveTranslation(pt.tags_v2.tag_translations_v2, uiLocale);
      return tr?.name ?? pt.tags_v2.slug;
    })
    .filter((s): s is string => Boolean(s));
}
