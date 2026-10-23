import { formatInTimeZone } from "date-fns-tz";
import type { SupportedLocale } from "@/lib/constants/locales";
import { breakName, type HolidayBreak } from "@/lib/holiday-breaks";
import { formatCompactDateRange } from "@/lib/date-format";
import type { ProductType } from "@/types";

/**
 * The "Holiday breaks" list a family reads before and after signing up: on the
 * product page and in the confirmation mail. Two surfaces state one fact, so the
 * span asked for, the breaks kept and the words each break is drawn in are
 * decided here, once.
 *
 * Only clubs follow holiday calendars, so every other product type asks for
 * nothing and shows nothing.
 *
 * **The list is the breaks still to come, every one of them.** A break is
 * listed while its last day is today or later in the club's own zone — so a
 * break in progress today still shows — and only if it removes at least one of
 * the club's sessions from today on. A break that removes nothing is not a
 * break this club takes: a calendar's summer break means nothing to a club
 * that does not meet in summer. There is no cap on how many are listed.
 *
 * - **A dated club** reads from today, or its first day if that is later, to
 *   its last day. A term already over reads nothing and lists nothing.
 * - **An open-ended club** has no last day, so it reads from today a year and a
 *   day ahead. The horizon bounds how far the database expands the club's
 *   planned sessions, and reaches the next breaks of any calendar whatever
 *   month it is.
 */

/** How far ahead an open-ended club reads its breaks — a year and a day. */
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
 * none — a product that is not a club, or a dated club whose last day is
 * already behind it. Every span starts at today in the product's zone at the
 * earliest, since a break that is over is never listed.
 */
export function holidayBreaksSpan(
  product: HolidayBreaksProduct,
  now: Date,
): { from: string; to: string } | null {
  if (!isClub(product.product_type)) return null;
  const today = productToday(product.timezone, now);
  if (product.end_date === null) {
    return { from: today, to: addDays(today, OPEN_ENDED_HORIZON_DAYS) };
  }
  if (product.end_date < today) return null;
  const from =
    product.start_date !== null && product.start_date > today
      ? product.start_date
      : today;
  return { from, to: product.end_date };
}

/**
 * The breaks the list shows, from what the database returned over that span —
 * in the database's order, which is by first day. The span already starts at
 * today; the check on each break's last day keeps a list read before midnight
 * from carrying a break that ended yesterday once the day has turned over.
 */
export function shownHolidayBreaks<
  T extends Pick<HolidayBreak, "endDate" | "withdrawnSessions">,
>(rows: readonly T[], today: string): T[] {
  return rows.filter(
    (row) => row.endDate >= today && row.withdrawnSessions.length > 0,
  );
}

/** One break as the list draws it: its name in the reader's locale, its dates. */
export interface HolidayBreakLine {
  id: string;
  name: string;
  range: string;
}

/**
 * The shown breaks, in words. Empty is the ordinary answer — a product that is
 * not a club, a club that follows no calendar, no break still to come — and
 * every surface omits the section for it rather than drawing an empty heading.
 */
export function holidayBreakLines(
  rows: readonly HolidayBreak[],
  { today, locale }: { today: string; locale: SupportedLocale },
): HolidayBreakLine[] {
  return shownHolidayBreaks(rows, today).map((row) => ({
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
