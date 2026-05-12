"use client";

import { useLocale, useTranslations } from "next-intl";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useCurrency } from "@/providers/currency-provider";
import type { ProductV2BrowseRow } from "@/types";
import type { ParticipationCounts } from "@/services/participations";
import { deriveRegistrationState } from "./derive-registration-state";
import { formatProductLocation } from "./format-product-location";
import { formatProductPrice } from "./format-product-price";
import {
  formatProductSchedule,
  scheduleCardLines,
} from "./format-product-schedule";
import {
  ProductBrowseCardView,
  type LocationLine,
  type SeatsHint,
} from "./product-browse-card-view";

interface ProductBrowseCardProps {
  product: ProductV2BrowseRow;
  /**
   * Participation counts for this product. Pre-fetched at the browse-page
   * level (one query for the whole grid) and threaded through. `null` while
   * the counts query is in flight — card falls back to 0/0/0.
   */
  counts?: ParticipationCounts | null;
}

// Adapter: resolves a `ProductV2BrowseRow` into the display props
// `ProductBrowseCardView` consumes. All locale / currency / time /
// participation lookups happen here so the View stays purely
// presentational — that's what lets the UI Components page render every
// state by hand without forging a full BrowseRow.
export function ProductBrowseCard({ product, counts }: ProductBrowseCardProps) {
  const t = useTranslations("productBrowse.card");
  const uiLocale = resolveLocale(useLocale());
  const { currency } = useCurrency();

  const tr = resolveTranslation(product.product_translations_v2, uiLocale);
  const topicTr = resolveTranslation(
    product.topics_v2?.topic_translations_v2,
    uiLocale,
  );

  // Seat math feeds active+reserving — reserving rows hold the seat for
  // 30 min during Stripe Checkout. The threshold check uses the same
  // count; small over-count for in-flight reservations is acceptable in v1.
  const participationsCount =
    (counts?.activeCount ?? 0) + (counts?.reservingCount ?? 0);

  const state = deriveRegistrationState({
    product,
    now: new Date(),
    participationsCount,
  });

  const schedule = formatProductSchedule({ product, locale: uiLocale });
  const price = formatProductPrice({
    prices: product.product_prices_v2,
    billingMode: product.billing_mode,
    productType: product.product_type,
    currency,
    locale: uiLocale,
  });

  const scheduleLines = scheduleCardLines(schedule, { withTimezone: true });

  const seatsHint: SeatsHint | null =
    product.seat_count !== null
      ? { kind: "capacity", count: product.seat_count }
      : product.waitlist_enabled
        ? { kind: "waitlist" }
        : null;

  const locationLine = resolveLocationLine(product, t("online"));

  return (
    <ProductBrowseCardView
      name={tr?.name ?? ""}
      description={tr?.description ?? null}
      imagePath={product.image_path}
      topicLabel={topicTr?.name ?? null}
      scheduleLines={scheduleLines}
      ageLine={t("ages", { min: product.min_age, max: product.max_age })}
      seatsHint={seatsHint}
      locationLine={locationLine}
      tagLabels={resolveTagLabels(product, uiLocale)}
      spokenLanguageCode={product.spoken_language_code}
      price={price}
      state={state}
      detailHref={detailHref(product.product_type, product.id)}
    />
  );
}

// Card stays compact: site name only (no parent) for in-person, city
// name for online municipality clubs, and a generic "Online" label for
// online non-muni products. The online row shows even though it's
// content-light — the parallel structure keeps every card visually
// stable across formats so the eye lands on the same meta line.
function resolveLocationLine(
  product: ProductV2BrowseRow,
  onlineLabel: string,
): LocationLine {
  const loc = formatProductLocation(product);
  if (!loc) return { kind: "online", label: onlineLabel };
  if (loc.kind === "site") {
    return { kind: "in_person", label: loc.site };
  }
  return { kind: "online_muni", label: loc.name };
}

function detailHref(productType: ProductV2BrowseRow["product_type"], id: string): string {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return `/clubs/${id}`;
    case "camp":
      return `/camps/${id}`;
    case "event":
      return `/events/${id}`;
  }
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

