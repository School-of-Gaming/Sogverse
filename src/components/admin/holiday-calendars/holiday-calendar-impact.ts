import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { HolidayCalendarChangePreview } from "@/services/holiday-calendars";
import type { ProductType } from "@/types";

/**
 * What a calendar save would change for one club, counted the way the confirm
 * dialog says it. Sessions split at the club's own today: a session on today's
 * date counts as still to come. Session dates are listed soonest first and
 * deduplicated, since two slots on one day are one date to a family; the counts
 * of written-up sessions and substitution requests are rows, one per group.
 */
export interface HolidayImpactSummary {
  productId: string;
  productType: ProductType;
  /** The club's name in the reader's locale, by the usual fallback. */
  name: string;
  /** The club's own today, `YYYY-MM-DD`, which decides where a date shows its year. */
  today: string;
  futureRemoved: string[];
  futureRestored: string[];
  pastRemoved: string[];
  pastRestored: string[];
  recordsHidden: number;
  recordsShown: number;
  requestsStopped: number;
  requestsReopened: number;
}

/** Distinct dates, in the order given (the preview's is soonest first). */
function distinctDates(sessions: readonly { date: string }[]): string[] {
  return [...new Set(sessions.map((session) => session.date))];
}

/** The preview's answer, one summary per affected club, ordered by name. */
export function summariseHolidayImpact(
  preview: HolidayCalendarChangePreview,
  uiLocale: SupportedLocale,
): HolidayImpactSummary[] {
  return preview.products
    .map((product) => {
      const upcoming = (session: { date: string }) => session.date >= product.today;
      const past = (session: { date: string }) => session.date < product.today;
      return {
        productId: product.productId,
        productType: product.productType,
        name:
          resolveTranslation(product.translations, uiLocale)?.name ?? "",
        today: product.today,
        futureRemoved: distinctDates(product.removed.filter(upcoming)),
        futureRestored: distinctDates(product.restored.filter(upcoming)),
        pastRemoved: distinctDates(product.removed.filter(past)),
        pastRestored: distinctDates(product.restored.filter(past)),
        recordsHidden: product.records.filter((r) => r.effect === "hidden").length,
        recordsShown: product.records.filter((r) => r.effect === "shown").length,
        requestsStopped: product.requests.filter((r) => r.effect === "no_session")
          .length,
        requestsReopened: product.requests.filter((r) => r.effect === "reopened")
          .length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, uiLocale));
}
