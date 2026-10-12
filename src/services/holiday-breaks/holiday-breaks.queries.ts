"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { holidayBreakKeys } from "./holiday-breaks.keys";
import { HolidayBreaksService } from "./holiday-breaks.service";

export { holidayBreakKeys };

/**
 * A product's holiday breaks over a span, or nothing at all while `span` is
 * `null` — a product that is not a club, or one whose row has not landed yet.
 *
 * **A new span of the same product keeps the previous answer until its own
 * lands**, so the read is pending once per product and never again: an
 * open-ended club's span moves when the day turns over under an open page, and
 * a page waiting on a first resolution must not see it go pending again. A
 * different product starts empty — another club's breaks are never a
 * placeholder for this one's.
 */
export function useHolidayBreaks(
  productId: string | undefined,
  span: { from: string; to: string } | null,
) {
  return useQuery({
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === productId ? previous : undefined,
    queryKey: holidayBreakKeys.forSpan(
      productId ?? "",
      span?.from ?? "",
      span?.to ?? "",
    ),
    queryFn: () =>
      new HolidayBreaksService(getClient()).getHolidayBreaks(
        productId ?? "",
        span?.from ?? "",
        span?.to ?? "",
      ),
    enabled: productId !== undefined && span !== null,
  });
}
