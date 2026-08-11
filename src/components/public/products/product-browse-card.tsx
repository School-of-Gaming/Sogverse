"use client";

import { useLocale, useTranslations } from "next-intl";
import { useNow, useTimezone } from "@/providers";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { DEFAULT_CURRENCY } from "@/lib/constants/currency";
import type { ProductBrowseRow } from "@/types";
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
  type SeatBarValue,
} from "./product-browse-card-view";

interface ProductBrowseCardProps {
  product: ProductBrowseRow;
  /**
   * Participation counts for this product. Pre-fetched at the browse-page
   * level (one query for the whole grid) and threaded through. `null` while
   * the counts query is in flight — card falls back to 0/0/0.
   */
  counts?: ParticipationCounts | null;
  /**
   * Detail-page URL override. Defaults to the storefront `/shop/[id]`; the
   * per-municipality schools page passes `/schools/<slug>/[id]` so the card,
   * and the detail page it opens, stay in that municipality's URL namespace.
   */
  detailHref?: string;
  /**
   * True when rendered on a single-municipality page, where the municipality is
   * already named in the page header. An online muni club then drops its
   * (redundant) municipality name and shows the generic "Online" label, like
   * any other online product.
   */
  municipalityScoped?: boolean;
}

// Adapter: resolves a `ProductBrowseRow` into the display props
// `ProductBrowseCardView` consumes. All locale / currency / time /
// participation lookups happen here so the View stays purely
// presentational — that's what lets the UI Components page render every
// state by hand without forging a full BrowseRow.
export function ProductBrowseCard({
  product,
  counts,
  detailHref,
  municipalityScoped = false,
}: ProductBrowseCardProps) {
  const t = useTranslations("productBrowse.card");
  const uiLocale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  // `useNow()` is seeded server-side at request time, so SSR and the first
  // client render agree — no hydration drift in the converted schedule.
  const now = useNow();
  const topicLabel = useTopicLabel();
  const currency = DEFAULT_CURRENCY;

  const tr = resolveTranslation(product.product_translations, uiLocale);

  // Seats are held by active participations alone. A parent part-way through
  // Stripe Checkout holds nothing — the row is created when the payment lands —
  // so this count and the capacity gate in the database read the same rows.
  const participationsCount = counts?.activeCount ?? 0;

  const state = deriveRegistrationState({
    product,
    now,
    participationsCount,
  });

  const schedule = formatProductSchedule({ product, locale: uiLocale, timeZone, now });
  const price = formatProductPrice({
    prices: product.product_prices,
    billingMode: product.billing_mode,
    productType: product.product_type,
    currency,
    locale: uiLocale,
  });

  const scheduleLines = scheduleCardLines(schedule);

  const isMuniClub = product.product_type === "municipality_club";

  // Muni clubs are externally funded — show a seat-fill bar in the footer
  // instead of a price. `total: null` (no seat count set yet) leaves the
  // footer-left empty; non-muni products get no bar and keep their price.
  //
  // This bar is the only seat information on any browse card. Nothing else here
  // reads `seat_count`, deliberately: caps are legal on every product type now,
  // and the meta row used to print the capacity of any capped non-muni product
  // — a number that reads as availability and is at its most misleading on a
  // product that is full. Fullness belongs to the details page.
  const seatBar: SeatBarValue | undefined = isMuniClub
    ? {
        filled: participationsCount,
        total: product.seat_count,
        waitlistEnabled: product.waitlist_enabled,
      }
    : undefined;

  const locationLine = resolveLocationLine(
    product,
    t("online"),
    uiLocale,
    municipalityScoped,
  );

  return (
    <ProductBrowseCardView
      name={tr?.name ?? ""}
      description={tr?.short_description ?? null}
      imagePath={product.image_path}
      topicLabel={topicLabel(product.topic)}
      scheduleLines={scheduleLines}
      ageLine={
        product.min_age !== null && product.max_age !== null
          ? t("ages", { min: product.min_age, max: product.max_age })
          : null
      }
      locationLine={locationLine}
      spokenLanguageCode={product.spoken_language_code}
      price={price}
      seatBar={seatBar}
      state={state}
      detailHref={detailHref ?? ROUTES.shopProduct(product.id)}
    />
  );
}

// Card stays compact: site name only (no parent) for in-person, city
// name for online municipality clubs, and a generic "Online" label for
// online non-muni products. The online row shows even though it's
// content-light — the parallel structure keeps every card visually
// stable across formats so the eye lands on the same meta line.
//
// `municipalityScoped` collapses an online muni club's city name to the generic
// "Online" label: on a single-municipality page the name is already in the page
// header, so repeating it on every card is noise.
function resolveLocationLine(
  product: ProductBrowseRow,
  onlineLabel: string,
  locale: string,
  municipalityScoped: boolean,
): LocationLine {
  const loc = formatProductLocation(product, locale);
  if (!loc) return { kind: "online", label: onlineLabel };
  if (loc.kind === "site") {
    return { kind: "in_person", label: loc.site };
  }
  if (municipalityScoped) return { kind: "online", label: onlineLabel };
  return { kind: "online_muni", label: loc.name };
}

