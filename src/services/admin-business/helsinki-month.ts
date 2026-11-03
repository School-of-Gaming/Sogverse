import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { monthsAfter } from "@/lib/calendar-date";

/**
 * The months the business page counts in: Helsinki calendar months, each from
 * midnight on its first day in Europe/Helsinki to midnight on the next month's.
 *
 * School of Gaming reports as the Finnish company it is, so a payment taken at
 * 00:30 on 1 March in Helsinki is March's money, although it is still February
 * in UTC. A month is named by its first day, `YYYY-MM-01` — the same key the
 * invoicing reads take, so a month handed to them is a month named here.
 *
 * Every instant crosses into a month through `formatInTimeZone`, and every
 * month back into an instant through `fromZonedTime`, so the offset is the one
 * in force on that date and the two DST changes cost no hour at either end.
 */
export const BUSINESS_TIME_ZONE = "Europe/Helsinki";

/** The Helsinki month an instant falls in, as its first day. */
export function helsinkiMonthOf(instant: Date): string {
  return `${formatInTimeZone(instant, BUSINESS_TIME_ZONE, "yyyy-MM")}-01`;
}

/** The instant a Helsinki month begins: midnight on its first day there. */
export function helsinkiMonthStart(month: string): Date {
  return fromZonedTime(`${month}T00:00:00`, BUSINESS_TIME_ZONE);
}

/** The instant a Helsinki month ends, exclusive: the next month's start. */
export function helsinkiMonthEnd(month: string): Date {
  return helsinkiMonthStart(monthsAfter(month, 1));
}

/**
 * The last `count` Helsinki months, ascending, ending with the month `now` is
 * in — so the last entry is a month still in progress.
 */
export function recentHelsinkiMonths(now: Date, count: number): string[] {
  const current = helsinkiMonthOf(now);
  return Array.from({ length: count }, (_, i) =>
    monthsAfter(current, i - (count - 1)),
  );
}
