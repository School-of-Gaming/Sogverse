"use client";

import { useLocale, useTranslations } from "next-intl";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useCurrency } from "@/providers/currency-provider";
import type { ProductV2BrowseRow } from "@/types";
import { deriveRegistrationState } from "./derive-registration-state";
import { formatProductLocation } from "./format-product-location";
import { formatProductPrice } from "./format-product-price";
import {
  formatProductSchedule,
  type ProductScheduleSummary,
  type ScheduleTimeGroup,
} from "./format-product-schedule";
import {
  ProductBrowseCardView,
  type LocationLine,
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

  const scheduleLines = scheduleLinesForCard(schedule);

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

// Card line count follows what's typical for each product type. Camps
// usually run multiple days per week with the same daily hours, so we
// split: line 1 is the date range, line 2 is the daily hours. Clubs
// usually run one weekday, so a single line fits — multi-weekday clubs
// are rare and fold onto the same line (line-clamp-1 truncates if it
// gets long; the detail page carries the full picture). Events are
// single date + time, one line.
function scheduleLinesForCard(schedule: ProductScheduleSummary): string[] {
  switch (schedule.kind) {
    case "tbd":
      return [];
    case "recurring": {
      const main = joinGroups(schedule.groups);
      return [withTz(main, schedule.tz)];
    }
    case "ranged": {
      const dateLine = withTz(
        `${schedule.startDate} – ${schedule.endDate}`,
        schedule.tz,
      );
      if (schedule.groups.length === 0) return [dateLine];
      // Common case (single time-bucket across all camp days): drop the
      // weekday list — the date range above already covers the calendar
      // shape, and "09:00–15:00" alone reads cleanly as "daily hours".
      // Multi-bucket camps keep weekday labels so the info isn't lost.
      const timeLine =
        schedule.groups.length === 1
          ? `${schedule.groups[0].startTime}–${schedule.groups[0].endTime}`
          : joinGroups(schedule.groups);
      return [dateLine, timeLine];
    }
    case "single": {
      const timeSuffix = schedule.time
        ? ` · ${schedule.time.start}–${schedule.time.end}`
        : "";
      return [withTz(`${schedule.date}${timeSuffix}`, schedule.tz)];
    }
  }
}

function joinGroups(groups: readonly ScheduleTimeGroup[]): string {
  return groups
    .map((g) => `${g.weekdaysLabel} · ${g.startTime}–${g.endTime}`)
    .join(", ");
}

function withTz(line: string, tz: string): string {
  return tz ? `${line} (${tz})` : line;
}
