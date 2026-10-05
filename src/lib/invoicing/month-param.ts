import { formatInTimeZone } from "date-fns-tz";
import { monthsAfter } from "@/lib/calendar-date";

/**
 * What an invoicing route does with its `?month=` parameter — the same answer
 * on every invoicing page, so it has one home.
 */

/**
 * The zone every invoicing month is measured in.
 *
 * School of Gaming invoices and is invoiced in Finland — a municipality club is
 * Finnish by definition, and a gedu invoices the Finnish company — so the month
 * a page defaults to is the month it is in Finland, not the month it is
 * wherever the server happens to be running. On the first and last day of a
 * month those are different answers, and the one that matters is the reader's.
 */
const INVOICING_TIME_ZONE = "Europe/Helsinki";

/**
 * `?month=YYYY-MM`, and nothing else — with the year inside this century.
 *
 * The year bound is not tidiness. `0007-03` and `9999-12` are both spelled
 * correctly, so a regex on the *shape* alone hands them to Postgres, which
 * happily answers a month nobody has ever invoiced and never will. A value that
 * cannot be a month anybody means is the same kind of wrong as a malformed one,
 * and takes the same answer: the default month.
 */
const MONTH_PARAM = /^20\d{2}-(0[1-9]|1[0-2])$/;

/**
 * Which month an invoicing page is showing: the one the URL names, or the
 * previous one.
 *
 * **The default is last month, not this one.** An invoice is raised for a month
 * that has finished — a half-month of sessions is not something anybody sends —
 * so the month a reader wants on opening the page is the one that just ended,
 * and the stepper is right there for the other months they might want.
 *
 * A malformed, absent or absurd parameter falls to that default rather than
 * refusing. There is nothing dangerous in the value — it selects a read that is
 * already role-gated — and a 404 for a mistyped URL would cost the reader the
 * page they can plainly see the rest of.
 */
export function resolveInvoicingMonthStart(
  raw: string | string[] | undefined,
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value !== undefined && MONTH_PARAM.test(value)) return `${value}-01`;

  const today = formatInTimeZone(new Date(), INVOICING_TIME_ZONE, "yyyy-MM-dd");
  return monthsAfter(`${today.slice(0, 7)}-01`, -1);
}
