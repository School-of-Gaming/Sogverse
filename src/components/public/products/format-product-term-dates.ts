import { formatDateRange } from "@/lib/utils";
import type { ProductBrowseRow } from "@/types";

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
  product: Pick<ProductBrowseRow, "product_type" | "start_date" | "end_date">,
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
