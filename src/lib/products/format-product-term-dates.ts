import { isoWeekOf, isoWeeksBetween } from "@/lib/iso-week";
import { formatDateRange } from "@/lib/utils";
import type { ProductType } from "@/types";

// Recurring clubs (consumer / municipality) run across a term whose start/end
// dates the weekly schedule line never conveys — so both the parent overview
// card and the admin details page surface the range. Camps/events are excluded
// on purpose: their dates already fold into the schedule summary
// (`format-product-schedule`), so a separate range there would just duplicate.
//
// The range string itself (separator, single-date collapse, UTC pinning) is
// `formatDateRange`'s job; this helper only adds the club gate. Returns `null`
// for a non-club or a club with no start date.
export function formatClubTermDates(
  product: {
    product_type: ProductType;
    start_date: string | null;
    end_date: string | null;
  },
  locale: string,
): string | null {
  if (
    product.product_type !== "consumer_club" &&
    product.product_type !== "municipality_club"
  ) {
    return null;
  }
  if (!product.start_date) return null;
  return formatDateRange(product.start_date, product.end_date, locale);
}

/**
 * The translator a week readout needs: `common.week`, `common.weekRange` and
 * `common.weekCount`.
 *
 * Declared structurally rather than as next-intl's own translator type so this
 * module stays free of the i18n runtime — every caller is a component that
 * already holds a `common` translator and simply hands it over.
 */
export type WeekTranslator = (
  key: "week" | "weekRange" | "weekCount",
  values: Record<string, number>,
) => string;

/**
 * `wk 34–50`, or `wk 34` for a span inside one week — the ISO week numbers a
 * Finnish admin plans a term in.
 *
 * **Furniture beside a planning date, never a replacement for one.** Every
 * caller renders this after the dates themselves; a week number alone tells a
 * reader which seven days without telling them which day, and only an admin
 * reads it at all (families are never shown week numbers).
 *
 * The two ends collapse to one label when they name the same week, and the
 * comparison is on the whole `{ isoYear, week }` pair rather than the number:
 * week 1 of 2027 is not week 1 of 2026, and a term crossing New Year is exactly
 * where a bare number comparison would silently print a single week for a
 * fifty-week range.
 */
export function formatProductWeeks(
  startDate: string,
  endDate: string | null,
  t: WeekTranslator,
): string {
  const start = isoWeekOf(startDate);
  const end = endDate === null ? null : isoWeekOf(endDate);
  if (end === null || (end.isoYear === start.isoYear && end.week === start.week)) {
    return t("week", { week: start.week });
  }
  return t("weekRange", { from: start.week, to: end.week });
}

/**
 * `wk 34–50 · 17 weeks` — the admin-only week readout that follows a product's
 * term range on the details page.
 *
 * **Admin-only, and deliberately not folded into `formatClubTermDates`.** That
 * helper is shared with the parent overview card, and a week number is admin
 * vocabulary: an admin plans a term as "viikot 34–50", a family is told which
 * dates their child is expected on. Keeping the two apart is what stops a
 * planning number leaking onto a family surface the next time the range moves.
 *
 * `null` unless both ends exist — an open-ended term has no week count to
 * state, and half a readout is worse than none.
 */
export function formatAdminTermWeeks(
  product: { start_date: string | null; end_date: string | null },
  t: WeekTranslator,
): string | null {
  const { start_date: start, end_date: end } = product;
  if (start === null || end === null) return null;
  const weeks = formatProductWeeks(start, end, t);
  return `${weeks} · ${t("weekCount", { count: isoWeeksBetween(start, end) })}`;
}
