import { monthsAfter } from "@/lib/calendar-date";
import { monthEndOf } from "@/lib/invoicing/month";
import type { InvoiceBillingCadence } from "@/types";

/**
 * The billing period a customer's file covers: a run of whole calendar months,
 * calendar-aligned.
 *
 * A quarter is Jan–Mar, Apr–Jun, Jul–Sep or Oct–Dec; a half-year is Jan–Jun or
 * Jul–Dec; and a month is a one-month period, which is what lets every
 * customer — monthly ones included — go through one path. Bare calendar
 * arithmetic on `YYYY-MM-01` strings, with no clock: which period a month
 * belongs to is a fact about the calendar, not about today.
 */

/** How many calendar months one period of each cadence spans. */
export const MONTHS_PER_PERIOD = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
} as const satisfies Record<InvoiceBillingCadence, number>;

export interface BillingPeriod {
  cadence: InvoiceBillingCadence;
  year: number;
  /**
   * Which period of its year this is, from 1: the month (1–12) for a monthly
   * customer, the quarter (1–4), or the half (1–2).
   */
  ordinal: number;
  /** Every month of the period as its first day, oldest first. */
  months: readonly string[];
  /** The period's first month, `YYYY-MM-01` — also its first day. */
  firstMonth: string;
  /**
   * The period's last month, `YYYY-MM-01` — the month its invoice is produced
   * in, and the month its number, invoice date and filename are derived from.
   */
  lastMonth: string;
  /** The period's last day, `YYYY-MM-DD`. */
  endDate: string;
}

/** The period of `cadence` that the month starting on `monthStart` falls in. */
export function billingPeriodOf(
  cadence: InvoiceBillingCadence,
  monthStart: string,
): BillingPeriod {
  const length = MONTHS_PER_PERIOD[cadence];
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  const ordinal = Math.floor((month - 1) / length) + 1;
  const firstMonth = `${year}-${String((ordinal - 1) * length + 1).padStart(2, "0")}-01`;
  const months = Array.from({ length }, (_unused, index) =>
    monthsAfter(firstMonth, index),
  );
  const lastMonth = months[months.length - 1];

  return {
    cadence,
    year,
    ordinal,
    months,
    firstMonth,
    lastMonth,
    endDate: monthEndOf(lastMonth),
  };
}

/**
 * Whether `monthStart` is the last month of its `cadence` period — the one
 * month a period's file can be produced in. Always true for a monthly customer.
 */
export function isPeriodEnd(
  cadence: InvoiceBillingCadence,
  monthStart: string,
): boolean {
  return billingPeriodOf(cadence, monthStart).lastMonth === monthStart;
}

/**
 * The months before `monthStart` that a period ending in `monthStart` spans,
 * for any of the cadences given — oldest first, without duplicates.
 *
 * What a reader of `monthStart` has to read besides the month itself to decide
 * every period file that is due in it: nothing for a month that ends no period
 * of a cadence in use, the two months before a quarter's end, the five before a
 * half-year's.
 */
export function earlierPeriodMonths(
  monthStart: string,
  cadences: Iterable<InvoiceBillingCadence>,
): string[] {
  const months = new Set<string>();
  for (const cadence of cadences) {
    const period = billingPeriodOf(cadence, monthStart);
    if (period.lastMonth !== monthStart) continue;
    for (const month of period.months) {
      if (month !== monthStart) months.add(month);
    }
  }
  return [...months].sort();
}
