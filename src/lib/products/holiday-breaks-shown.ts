import { formatInTimeZone } from "date-fns-tz";
import type { SupportedLocale } from "@/lib/constants/locales";
import { breakName, type HolidayBreak } from "@/lib/holiday-breaks";
import { formatCompactDateRange } from "@/lib/utils";
import type { ProductType } from "@/types";

/**
 * The "Holiday breaks" list a family reads before and after signing up: on the
 * product page, on the purchase confirmation page and in the confirmation mail.
 * Three surfaces state one fact, so the span asked for, the breaks kept and the
 * words each break is drawn in are decided here, once.
 *
 * Only clubs follow holiday calendars, so every other product type asks for
 * nothing and shows nothing.
 *
 * - **A dated club** lists every break that removed at least one session inside
 *   its term.
 * - **An open-ended club** has no term to bound the list, so it lists the next
 *   few breaks that end on or after today and removed a session — enough to
 *   answer "when are the next breaks?" without a list that runs on for years.
 *
 * A break that removed nothing is not a break this club takes, so it is never
 * listed: a calendar's summer break means nothing to a club that does not meet
 * in summer.
 */

/** How many upcoming breaks an open-ended club lists. */
export const OPEN_ENDED_BREAKS_SHOWN = 3;

/** How far ahead an open-ended club looks for them — a year and a day. */
const OPEN_ENDED_HORIZON_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The product columns the list is decided from. */
export interface HolidayBreaksProduct {
  product_type: ProductType;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
}

function isClub(productType: ProductType): boolean {
  return productType === "consumer_club" || productType === "municipality_club";
}

/** The product-local `YYYY-MM-DD` that `now` falls on. */
export function productToday(timezone: string, now: Date): string {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
}

/**
 * The span to read a product's breaks over, or `null` for a product that shows
 * none. A dated club reads its term; an open-ended one reads from today (in the
 * product's zone) a year and a day ahead, which reaches the next breaks of any
 * calendar whatever month it is.
 */
export function holidayBreaksSpan(
  product: HolidayBreaksProduct,
  now: Date,
): { from: string; to: string } | null {
  if (!isClub(product.product_type)) return null;
  const today = productToday(product.timezone, now);
  if (product.end_date !== null) {
    return { from: product.start_date ?? today, to: product.end_date };
  }
  return { from: today, to: addDays(today, OPEN_ENDED_HORIZON_DAYS) };
}

/**
 * The breaks the list shows, from what the database returned over that span —
 * in the database's order, which is by first day.
 */
export function shownHolidayBreaks<
  T extends Pick<HolidayBreak, "endDate" | "withdrawnSessions">,
>(rows: readonly T[], endDate: string | null, today: string): T[] {
  const taken = rows.filter((row) => row.withdrawnSessions.length > 0);
  if (endDate !== null) return taken;
  return taken
    .filter((row) => row.endDate >= today)
    .slice(0, OPEN_ENDED_BREAKS_SHOWN);
}

/** One break as the list draws it: its name in the reader's locale, its dates. */
export interface HolidayBreakLine {
  id: string;
  name: string;
  range: string;
}

/**
 * The shown breaks, in words. Empty is the ordinary answer — a product that is
 * not a club, a club that follows no calendar, a term no break touches — and
 * every surface omits the section for it rather than drawing an empty heading.
 */
export function holidayBreakLines(
  rows: readonly HolidayBreak[],
  {
    endDate,
    today,
    locale,
  }: { endDate: string | null; today: string; locale: SupportedLocale },
): HolidayBreakLine[] {
  return shownHolidayBreaks(rows, endDate, today).map((row) => ({
    id: row.id,
    name: breakName(row, locale),
    range: formatCompactDateRange(row.startDate, row.endDate, locale, today),
  }));
}

/** A `YYYY-MM-DD` date `days` later, by UTC-pinned calendar arithmetic. */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return formatInTimeZone(
    new Date(Date.UTC(year, month - 1, day) + days * DAY_MS),
    "UTC",
    "yyyy-MM-dd",
  );
}
