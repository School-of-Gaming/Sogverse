import { addCalendarDays, monthsAfter } from "@/lib/calendar-date";
import { monthEndOf } from "@/lib/invoicing/month";
import { sumCents } from "@/lib/utils";
import {
  buildMunicipalityInvoicing,
  type InvoiceClub,
  type InvoiceCustomerSummary,
  type MunicipalityInvoicingView,
} from "@/components/admin/municipality-invoicing/build-municipality-invoicing";
import type { InvoiceCustomerRow } from "@/services/invoice-customers";
import type { MunicipalityInvoicingSnapshot } from "@/services/municipality-invoicing";
import type { InvoiceBillingCadence } from "@/types";
import { billingPeriodOf, type BillingPeriod } from "./billing-period";
import {
  FINVOICE_LOCALE,
  FINVOICE_PAYMENT_TERM_DAYS,
  FINVOICE_ROWS_EXPLANATION,
  FINVOICE_VAT_PER_MILLE,
} from "./finvoice-constants";

/**
 * One Fennoa customer's billing period, turned into the invoice a Finvoice
 * file states.
 *
 * A second pure build over the ledger's own view model: the page and the file
 * are two readings of the same documents, and deriving the file from the built
 * months rather than from the wire is what makes "the file says what the page
 * said" a structural fact rather than a hope. Nothing here has a clock, a query
 * or a translator — the generation timestamp is the serializer's, and every
 * name is a name the view already resolved in the export's own locale.
 *
 * **A period is a run of whole calendar months** — one month for a monthly
 * customer, a calendar quarter or half-year for the others — and the file for
 * it is built from one built month per month of the period. A monthly
 * customer's period is its month, so the monthly file is the one-month case of
 * the same build rather than a second path.
 *
 * The rules this implements are written out in
 * `src/components/admin/municipality-invoicing/CLAUDE.md`.
 *
 * ## The money rule
 *
 * **Integer cents end to end, and the totals are the sums of the rows.** A row's
 * net is its session count times its fee; its VAT is that net times the rate,
 * rounded half up; its gross is the two added. The invoice's three totals are
 * the sums of the rows' three figures — never a second calculation over the
 * invoice net, which is what made the old system's files disagree with
 * themselves by a cent. The division into euros happens once, in the
 * serializer.
 *
 * ## What it refuses, and why refusing beats answering
 *
 * Every refusal is a typed value rather than an exception, because each is an
 * ordinary state of an ordinary month rather than a fault: a period that has
 * not ended yet, a club that ran with no fee filled in, and a customer whose
 * clubs all sat the period out. The caller renders them — the page as a label
 * or a disabled control with the reason, the route as a 409 — and one predicate
 * decides all of them, so a control that says a file can be produced and a
 * route that then refuses to produce it cannot disagree.
 */

// ---------------------------------------------------------------------------
// The invoice
// ---------------------------------------------------------------------------

/** One club's line for one month: what ran, at what price, and what it comes to. */
export interface FinvoiceRow {
  /** 1-based: month by month, and within a month in the order the ledger prints the clubs. */
  rowNumber: number;
  /** The club this row bills for — carried so a caller can trace a figure back. */
  clubId: string;
  /** The month this row bills, as its first day. */
  monthStart: string;
  /** The month's last day — with `monthStart`, the period this row bills for. */
  monthEnd: string;
  /**
   * What the buyer reads: the municipality, the hall where the club is not the
   * municipality's own, the club, and its weekly cadence — and, on an invoice
   * covering several months, which month the row is.
   */
  text: string;
  /** Sessions billed — a whole number of them; the file states two decimals. */
  sessions: number;
  /** The club's current per-session fee, in cents. */
  unitPriceCents: number;
  /** `sessions × unitPriceCents`. */
  netCents: number;
  /** The net times the VAT rate, rounded half up to the cent. */
  vatCents: number;
  /** `netCents + vatCents`. */
  grossCents: number;
}

/** One customer's whole billing period as one invoice. */
export interface FinvoiceInvoice {
  /** The buyer, whole — the number Fennoa matches on and the address it wants. */
  customer: InvoiceCustomerRow;
  /** The months the invoice covers — one, three or six. */
  period: BillingPeriod;
  /**
   * The period's last month, as its first day (`YYYY-MM-01`): what the
   * reference, the invoice date and the filename are derived from, so a monthly
   * invoice is named and referenced by the month it bills.
   */
  monthStart: string;
  /**
   * Our reference for the invoice, written as its invoice number and its
   * message identifier — `SOG-`, the period's last month and the customer's own
   * Fennoa number. **Deliberately not numeric, so Fennoa skips it** and numbers
   * the invoice from its own series; re-exporting a period produces the same
   * reference again however its data has moved.
   */
  invoiceReference: string;
  /** `CCYYMMDD` — the first day of the month *after* the period invoiced. */
  invoiceDate: string;
  /** `CCYYMMDD` — the invoice date plus the payment term. */
  dueDate: string;
  /** The free-text block, newline-separated, ready to be written as one element. */
  freeText: string;
  rows: readonly FinvoiceRow[];
  netCents: number;
  vatCents: number;
  grossCents: number;
}

/**
 * Whether a customer's file can be produced for a month, and why not where it
 * cannot.
 *
 * - `not_period_end` — the customer is invoiced quarterly or half-yearly and the
 *   month is not its period's last. The period's file is produced in its last
 *   month and nowhere else, so a month in the middle has no file of its own.
 * - `period_not_read` — the month ends the period, but not every month of the
 *   period is in hand. Only a caller that read less than the period can meet
 *   it; it is a state to wait out, never a verdict about the data.
 * - `club_without_fee` — at least one club that **ran** in a month of the
 *   period — has at least one billed session, recorded or not — has no
 *   per-session fee. `monthStart` names the first such month, which is where
 *   the repair is to be looked for. **The whole file is refused rather than the
 *   club being dropped**, because a file that silently omits a club that ran is
 *   a total that is short, and a short total is the one thing nobody downstream
 *   catches. A club with nothing billed is not in this count: it puts no row
 *   and no money on the file whatever its fee, so it cannot make the file
 *   wrong.
 * - `nothing_to_invoice` — none of the customer's clubs has a billed session
 *   in the period. An invoice for nothing is a document somebody has to explain.
 */
export type FinvoiceFileState =
  | {
      ok: true;
      period: BillingPeriod;
      /** Sessions the file bills, across the period. */
      billedCount: number;
      /** What the file comes to before VAT — the ledger's own kind of figure. */
      netCents: number;
    }
  | { ok: false; reason: "not_period_end"; period: BillingPeriod }
  | { ok: false; reason: "period_not_read"; period: BillingPeriod }
  | {
      ok: false;
      reason: "club_without_fee";
      period: BillingPeriod;
      /** The first month of the period in which a club ran with no fee. */
      monthStart: string;
      /** How many of the customer's clubs ran with no fee in that month. */
      clubsWithoutFee: number;
    }
  | { ok: false; reason: "nothing_to_invoice"; period: BillingPeriod };

/** Why the export route will not produce a file. */
export type FinvoiceRefusal =
  | { ok: false; reason: "unknown_customer" }
  | Exclude<FinvoiceFileState, { ok: true } | { reason: "period_not_read" }>;

export type FinvoiceRefusalReason = FinvoiceRefusal["reason"];

export type FinvoiceResult =
  | { ok: true; invoice: FinvoiceInvoice }
  | FinvoiceRefusal;

export interface FinvoiceFileStateArgs {
  /** The month the file is asked for. */
  monthStart: string;
  /** How often the customer is invoiced. */
  cadence: InvoiceBillingCadence;
  /**
   * The customer's summary for each month that has been read, keyed by the
   * month's first day: null where the month was read and has no club of the
   * customer's in it, absent where the month has not been read at all.
   */
  months: ReadonlyMap<string, InvoiceCustomerSummary | null>;
}

/**
 * Whether a customer's file can be produced for a month — **the one predicate
 * the page's control and the export route both ask.**
 *
 * The page shows a label, a disabled control with the reason, or a link, and
 * the route answers a 409 or a file, from this answer and from nothing else.
 * Neither re-derives the rule, so a control that says a file can be produced and
 * a route that then refuses to produce one cannot happen.
 *
 * **What it asks is whether the FILE would be wrong, never whether the data
 * is.** A fee nobody has set is an admin error, and it is already named on the
 * club's own line in the ledger and raised as an attention item on the admin
 * dashboard. A refusal here on top of that is a third alarm for the same thing
 * — and a wrong one where the club never met, because such a club is on no
 * invoice at all and its price therefore changes no figure in the file.
 */
export function finvoiceFileState({
  monthStart,
  cadence,
  months,
}: FinvoiceFileStateArgs): FinvoiceFileState {
  const period = billingPeriodOf(cadence, monthStart);
  if (period.lastMonth !== monthStart) {
    return { ok: false, reason: "not_period_end", period };
  }
  if (!period.months.every((month) => months.has(month))) {
    return { ok: false, reason: "period_not_read", period };
  }

  const summaries = period.months.flatMap((month) => {
    const summary = months.get(month);
    return summary === null || summary === undefined
      ? []
      : [{ month, summary }];
  });

  // The first month in which a club ran with no fee, because that is the month
  // an admin has to open to find it — a quarter's file refused in March over a
  // club that met only in January would otherwise send them looking at March.
  const unpriced = summaries.find(
    ({ summary }) => summary.clubsThatRanWithoutFee > 0,
  );
  if (unpriced !== undefined) {
    return {
      ok: false,
      reason: "club_without_fee",
      period,
      monthStart: unpriced.month,
      clubsWithoutFee: unpriced.summary.clubsThatRanWithoutFee,
    };
  }

  const billedCount = summaries.reduce(
    (count, { summary }) => count + summary.billedCount,
    0,
  );
  if (billedCount === 0) {
    return { ok: false, reason: "nothing_to_invoice", period };
  }

  return {
    ok: true,
    period,
    billedCount,
    // Every club that ran has a fee by now, so its total is a number; the
    // file's net is exactly this sum of the same products.
    netCents: sumCents(
      summaries.flatMap(({ summary }) =>
        summary.clubs.flatMap((club) =>
          club.billedCount > 0 && club.totalCents !== null
            ? [club.totalCents]
            : [],
        ),
      ),
    ),
  };
}

/**
 * One customer's summary in every month of `views`, keyed by the month's first
 * day — null for a month that was read and has none of the customer's clubs.
 * This is the shape `finvoiceFileState` takes.
 */
export function customerMonths(
  views: readonly MunicipalityInvoicingView[],
  customerId: string,
): Map<string, InvoiceCustomerSummary | null> {
  return new Map(
    views.map((view) => [
      view.monthStart,
      view.customers.find((one) => one.customer.id === customerId) ?? null,
    ]),
  );
}

/** One customer's file as the page shows it beside a municipality. */
export interface CustomerFile {
  customer: InvoiceCustomerRow;
  state: FinvoiceFileState;
}

export interface CustomerFilesForMonth {
  /** Every customer with a club in the month, by customer id. */
  byCustomerId: ReadonlyMap<string, CustomerFile>;
  /**
   * The customers whose period ends in the month and who have no club in the
   * month itself — a quarterly buyer whose clubs' term ended in May still owes
   * the quarter that ends in June. They sit on no municipality's line, because
   * the month has no club of theirs to put them under, so the page lists them on
   * a line of their own. Ordered by customer number, like every list of buyers.
   */
  withoutClubThisMonth: readonly CustomerFile[];
}

/**
 * Every customer file the page shows for a month, decided by the same predicate
 * the route asks.
 *
 * `views` holds the month itself and whichever earlier months have been read;
 * a period whose earlier months are not among them is `period_not_read` rather
 * than a figure computed over the part that is.
 */
export function customerFilesForMonth({
  monthStart,
  views,
}: {
  monthStart: string;
  views: readonly MunicipalityInvoicingView[];
}): CustomerFilesForMonth {
  const current = views.find((view) => view.monthStart === monthStart);
  const fileFor = (customer: InvoiceCustomerRow): CustomerFile => ({
    customer,
    state: finvoiceFileState({
      monthStart,
      cadence: customer.billing_cadence,
      months: customerMonths(views, customer.id),
    }),
  });

  const byCustomerId = new Map(
    (current?.customers ?? []).map((summary) => [
      summary.customer.id,
      fileFor(summary.customer),
    ]),
  );

  // The newest earlier reading of each absent customer, so a buyer whose
  // details changed during the period is shown as it stands now.
  const absent = new Map<string, InvoiceCustomerRow>();
  const earlier = views
    .filter((view) => view.monthStart < monthStart)
    .sort((a, b) => (a.monthStart < b.monthStart ? 1 : -1));
  for (const view of earlier) {
    for (const summary of view.customers) {
      const { customer } = summary;
      if (byCustomerId.has(customer.id) || absent.has(customer.id)) continue;
      const period = billingPeriodOf(customer.billing_cadence, monthStart);
      if (
        period.lastMonth === monthStart &&
        period.months.includes(view.monthStart)
      ) {
        absent.set(customer.id, customer);
      }
    }
  }

  return {
    byCustomerId,
    withoutClubThisMonth: [...absent.values()]
      .sort(compareCustomerNumbers)
      .map(fileFor),
  };
}

function compareCustomerNumbers(
  a: InvoiceCustomerRow,
  b: InvoiceCustomerRow,
): number {
  return a.fennoa_customer_no < b.fennoa_customer_no
    ? -1
    : a.fennoa_customer_no > b.fennoa_customer_no
      ? 1
      : 0;
}

export interface BuildFinvoiceInvoiceArgs {
  /** The month the file is asked for — for a period customer, its last month. */
  monthStart: string;
  /**
   * Built months, in any order — the same views the ledger renders. They must
   * include every month of the customer's period; the export route reads
   * exactly those.
   */
  views: readonly MunicipalityInvoicingView[];
  /** Which customer the file is for. */
  customerId: string;
}

export function buildFinvoiceInvoice({
  monthStart,
  views,
  customerId,
}: BuildFinvoiceInvoiceArgs): FinvoiceResult {
  // The customer as the newest month that has it — its cadence decides the
  // period, and its number, name and address go on the file.
  const newestFirst = views
    .filter((view) => view.monthStart <= monthStart)
    .sort((a, b) => (a.monthStart < b.monthStart ? 1 : -1));
  let found:
    | { summary: InvoiceCustomerSummary; position: number }
    | undefined;
  for (const view of newestFirst) {
    const position = view.customers.findIndex(
      (one) => one.customer.id === customerId,
    );
    if (position !== -1) {
      found = { summary: view.customers[position], position };
      break;
    }
  }
  if (found === undefined) return { ok: false, reason: "unknown_customer" };

  const months = customerMonths(views, customerId);
  const state = finvoiceFileState({
    monthStart,
    cadence: found.summary.customer.billing_cadence,
    months,
  });
  if (!state.ok) {
    if (state.reason === "period_not_read") {
      // A caller that asks for a file has to have read the period; answering
      // over part of it would be a short invoice with nothing saying so.
      throw new Error(
        `buildFinvoiceInvoice: the ${state.period.cadence} period ending ${monthStart} was not read whole`,
      );
    }
    return state;
  }

  const { period } = state;
  const severalMonths = period.months.length > 1;

  // Only the clubs with a billed session get a row. A club with a fee and no
  // sessions is not a zero line — it is a club that was not delivered that
  // month, and a row worth €0.00 invites the buyer to ask what it is. Month by
  // month, so the file reads in the order the months were checked.
  const rows = period.months
    .flatMap((month) =>
      (months.get(month)?.clubs ?? [])
        .filter((club) => club.billedCount > 0)
        .map((club) => ({ club, month })),
    )
    .map(({ club, month }, index) =>
      buildRow(club, month, index + 1, severalMonths),
    );

  const invoiceDate = monthsAfter(period.lastMonth, 1);
  const customer = stripZeroWidthFromCustomer(found.summary.customer);

  return {
    ok: true,
    invoice: {
      customer,
      period,
      monthStart: period.lastMonth,
      invoiceReference: invoiceReferenceFor(
        customer,
        period.lastMonth,
        found.position,
      ),
      invoiceDate: compactDate(invoiceDate),
      dueDate: compactDate(
        addCalendarDays(invoiceDate, FINVOICE_PAYMENT_TERM_DAYS),
      ),
      freeText: freeTextFor(customer, period),
      rows,
      // The three totals are the sums of the rows and nothing else, which is
      // what makes the invoice foot by construction.
      netCents: sumCents(rows.map((row) => row.netCents)),
      vatCents: sumCents(rows.map((row) => row.vatCents)),
      grossCents: sumCents(rows.map((row) => row.grossCents)),
    },
  };
}

export interface BuildFinvoiceForPeriodArgs {
  /** The month the file is asked for — for a period customer, its last month. */
  monthStart: string;
  /**
   * The invoicing document for every month of the customer's period, exactly
   * as the page's route reads them — one, for a monthly customer.
   */
  snapshots: readonly MunicipalityInvoicingSnapshot[];
  /** Which customer the file is for. */
  customerId: string;
  /** Request-stable "now" — what decides which of a club's dates have arrived. */
  now: Date;
}

/**
 * The whole export in one call: build each month, then build the customer's
 * invoice out of them.
 *
 * It exists so the route imports one module rather than two, and so the
 * export's locale is decided here rather than restated at every call site. The
 * file goes to a Finnish municipality's accounts payable, so it is built in
 * Finnish whatever locale the admin who asked for it reads the ledger in.
 */
export function buildFinvoiceForPeriod({
  monthStart,
  snapshots,
  customerId,
  now,
}: BuildFinvoiceForPeriodArgs): FinvoiceResult {
  const views = snapshots.map((snapshot) =>
    buildMunicipalityInvoicing({ snapshot, locale: FINVOICE_LOCALE, now }),
  );
  return buildFinvoiceInvoice({ monthStart, views, customerId });
}

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

function buildRow(
  club: InvoiceClub,
  monthStart: string,
  rowNumber: number,
  namesTheMonth: boolean,
): FinvoiceRow {
  // Non-null by `finvoiceFileState`, which refuses the whole file when any club
  // that ran has no fee — and only a club that ran becomes a row. Coerced
  // rather than asserted so a future caller that skipped the check produces a
  // visible zero rather than a crash halfway through writing a file.
  const unitPriceCents = club.feeCents ?? 0;
  const netCents = sumCents([unitPriceCents * club.billedCount]);
  const vatCents = vatOf(netCents);
  const text = rowText(club);

  return {
    rowNumber,
    clubId: club.id,
    monthStart,
    monthEnd: monthEndOf(monthStart),
    // An invoice covering several months carries one row per club per month,
    // so the month is part of what tells two rows of one club apart.
    text: namesTheMonth ? `${text} (${monthLabel(monthStart)})` : text,
    sessions: club.billedCount,
    unitPriceCents,
    netCents,
    vatCents,
    grossCents: netCents + vatCents,
  };
}

/**
 * VAT on a net amount, in cents, rounded half up.
 *
 * Integer arithmetic throughout: the rate is per mille, so the multiplication
 * and the half-up rounding are both exact for every amount a club can bill, and
 * the result never depends on how a float happened to land.
 */
export function vatOf(netCents: number): number {
  return Math.floor((netCents * FINVOICE_VAT_PER_MILLE + 500) / 1000);
}

/**
 * What one row says: the municipality, the hall, the club and when it meets.
 *
 * **The hall is named only where it is not the municipality itself.** A remote
 * club points at its municipality directly, and a row reading "Oulu - Oulu -
 * Verkkoklubi Oulu" would be saying the same word twice to somebody checking an
 * invoice line against a school's own records.
 *
 * Zero-width characters are stripped from every name. At least one production
 * school name carries a zero-width space, which survives every database round
 * trip, is invisible in the admin UI, and would reach a buyer's accounting
 * system as a byte their own search for the row will not match.
 */
function rowText(club: InvoiceClub): string {
  const names = [
    club.municipalityName,
    club.locationIsMunicipality ? null : club.locationName,
    club.name,
  ]
    .filter((part): part is string => part !== null && part.trim() !== "")
    .map(stripZeroWidth);

  const line = names.join(" - ");
  const schedule = club.compactSchedule;
  return schedule === null ? line : `${line} ${stripZeroWidth(schedule)}`;
}

/**
 * Every code point that takes no width: the zero-width space, non-joiner and
 * joiner, the word joiner, and a byte-order mark that arrived as text.
 */
const ZERO_WIDTH = /[​-‍⁠﻿]/g;

function stripZeroWidth(value: string): string {
  return value.replace(ZERO_WIDTH, "");
}

/**
 * The same strip over every value the buyer's half of the file is written from.
 *
 * The names on a club's row are not the only text somebody typed: the buyer's
 * own fields are typed into the customer form, arrive by paste as often as not,
 * and land in the two places a zero-width character costs the most — the
 * identifier and name Fennoa matches the buyer on, where an invisible byte makes
 * a file match nobody and **create a customer**, and the address and free text
 * that print on the letter a municipality's accounts payable reads.
 *
 * Done once, here, so the invoice carries a clean customer and neither the
 * serializer nor the free-text block has to remember. `id` is left alone: it is
 * our own key, it is never written into a file, and stripping it would quietly
 * change what the invoice says it is for.
 */
function stripZeroWidthFromCustomer(
  customer: InvoiceCustomerRow,
): InvoiceCustomerRow {
  return {
    ...customer,
    fennoa_customer_no: stripZeroWidth(customer.fennoa_customer_no),
    invoice_name: stripZeroWidth(customer.invoice_name),
    street: stripZeroWidth(customer.street),
    postal_code: stripZeroWidth(customer.postal_code),
    city: stripZeroWidth(customer.city),
    country_code: stripZeroWidth(customer.country_code),
    your_reference:
      customer.your_reference === null
        ? null
        : stripZeroWidth(customer.your_reference),
    invoice_text:
      customer.invoice_text === null
        ? null
        : stripZeroWidth(customer.invoice_text),
  };
}

/**
 * The free-text block: whatever the customer asked for on every invoice, then
 * the period this one covers, then what the rows are counting.
 *
 * The customer's own text comes first because it is the thing that buyer asked
 * to see, and a reference line buried under two standing sentences is one a
 * clerk scrolls past. Its line endings are normalized, so a value pasted from
 * Windows does not put stray carriage returns inside an XML element.
 */
function freeTextFor(customer: InvoiceCustomerRow, period: BillingPeriod): string {
  const lines: string[] = [];
  const own = customer.invoice_text?.trim();
  if (own !== undefined && own !== "") {
    lines.push(own.replace(/\r\n?/g, "\n"));
  }
  lines.push(`Laskutuskausi ${billingPeriodLabel(period)}`);
  lines.push(FINVOICE_ROWS_EXPLANATION);
  return lines.join("\n");
}

/**
 * `5/26` for May 2026, and `1–3/26` for the quarter January to March — the
 * months unpadded, the year in two digits. A calendar-aligned period never
 * crosses a year, so one year closes the range.
 */
function billingPeriodLabel(period: BillingPeriod): string {
  const first = Number(period.firstMonth.slice(5, 7));
  const last = Number(period.lastMonth.slice(5, 7));
  const year = period.lastMonth.slice(2, 4);
  return first === last ? `${last}/${year}` : `${first}–${last}/${year}`;
}

/** `1/26` for January 2026 — how a period invoice's row says which month it is. */
function monthLabel(monthStart: string): string {
  return `${Number(monthStart.slice(5, 7))}/${monthStart.slice(2, 4)}`;
}

/** `2026-06-01` → `20260601`, which is what `Format="CCYYMMDD"` means. */
export function compactDate(date: string): string {
  return date.replace(/-/g, "");
}

/** What every reference starts with, and what makes it not a number. */
const INVOICE_REFERENCE_PREFIX = "SOG-";

/**
 * The most customer digits a reference keeps, from the right. `SOG-` and the
 * `YYYYMM` take ten characters and Finvoice allows an invoice number twenty.
 */
const INVOICE_REFERENCE_TAIL_DIGITS = 10;

/**
 * Our reference for a file: `SOG-`, the period's last month, then the digits of
 * the customer's Fennoa number. `F0037` in May 2026 is `SOG-2026050037`, and
 * `F0037`'s quarter ending in June 2026 is `SOG-2026060037`.
 *
 * **It is written as the invoice number, and it is deliberately not a
 * number.** Fennoa keeps a numeric invoice number from an imported file as the
 * invoice's final number once the invoice is approved, and skips one carrying
 * anything but digits, numbering the invoice from its own series instead. The
 * prefix is what keeps our invoices in that series. Nothing is written when a
 * file is produced, and producing one twice produces the same file.
 *
 * **It is derived from the customer rather than from the customer's place in
 * the month**, because a re-export has to be recognisably the same invoice as
 * the export it replaces, whatever changed in between — and a position is not a
 * property of the customer at all. Link one more club to a new buyer and every
 * later customer's position shifts by one, so a file downloaded again after
 * that edit would come back under a different reference. A Fennoa number
 * belongs to the customer and does not move. A customer is invoiced at one
 * cadence, so its period ends are distinct months and no two of its files share
 * a reference.
 *
 * **What it guarantees within a month, stated exactly**: it is unique across
 * customers whose numbers differ in their last ten *digits*, because those are
 * all it keeps. Every number Fennoa issues differs there — but `0204` and
 * `F0204` are two customers with one reference, and so are the digitless
 * fallback's first customer and a real `F0001`. Those are shapes Fennoa does
 * not issue; the column is free text, so they can be typed, and this is what
 * would happen if they were.
 */
function invoiceReferenceFor(
  customer: InvoiceCustomerRow,
  monthStart: string,
  position: number,
): string {
  const yearMonth = `${monthStart.slice(0, 4)}${monthStart.slice(5, 7)}`;
  const digits = customer.fennoa_customer_no.replace(/\D/g, "");
  // A customer number with no digit in it is not a shape Fennoa issues, but the
  // column is free text, so there has to be an answer: the customer's 1-based
  // position in the newest month of the period it has a club in, padded to
  // four. It is stable only for as long as that month's customer list is,
  // which is the most a reference carrying nothing of the customer's own can
  // promise.
  const tail = digits === "" ? String(position + 1).padStart(4, "0") : digits;
  return `${INVOICE_REFERENCE_PREFIX}${yearMonth}${tail.slice(-INVOICE_REFERENCE_TAIL_DIGITS)}`;
}
