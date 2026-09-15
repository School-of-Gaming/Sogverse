import { addCalendarDays, monthsAfter } from "@/lib/calendar-date";
import { sumCents } from "@/lib/utils";
import {
  buildMunicipalityInvoicing,
  type InvoiceClub,
  type InvoiceCustomerSummary,
  type MunicipalityInvoicingView,
} from "@/components/admin/municipality-invoicing/build-municipality-invoicing";
import type { InvoiceCustomerRow } from "@/services/invoice-customers";
import type { MunicipalityInvoicingSnapshot } from "@/services/municipality-invoicing";
import {
  FINVOICE_LOCALE,
  FINVOICE_PAYMENT_TERM_DAYS,
  FINVOICE_ROWS_EXPLANATION,
  FINVOICE_VAT_PER_MILLE,
} from "./finvoice-constants";

/**
 * One Fennoa customer's month, turned into the invoice a Finvoice file states.
 *
 * A second pure build over the ledger's own view model: the page and the file
 * are two readings of one document, and deriving the file from the built view
 * rather than from the wire is what makes "the file says what the page said" a
 * structural fact rather than a hope. Nothing here has a clock, a query or a
 * translator — the generation timestamp is the serializer's, and every name is
 * a name the view already resolved in the export's own locale.
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
 * Both refusals are typed values rather than exceptions, because both are
 * ordinary states of an ordinary month rather than faults: a club that ran with
 * no fee filled in, and a customer whose clubs all sat out the month.
 * The caller renders them — the page as a disabled control with the reason, the
 * route as a 409 — and the same predicate decides both, so a control that says
 * a file can be produced and a route that then refuses to produce it cannot
 * disagree.
 */

// ---------------------------------------------------------------------------
// The invoice
// ---------------------------------------------------------------------------

/** One club's line on the invoice: what ran, at what price, and what it comes to. */
export interface FinvoiceRow {
  /** 1-based, in the order the ledger prints the clubs. */
  rowNumber: number;
  /** The club this row bills for — carried so a caller can trace a figure back. */
  clubId: string;
  /**
   * What the buyer reads: the municipality, the hall where the club is not the
   * municipality's own, the club, and its weekly cadence.
   */
  text: string;
  /** Sessions that ran — a whole number of them; the file states two decimals. */
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

/** One customer's whole month as one invoice. */
export interface FinvoiceInvoice {
  /** The buyer, whole — the number Fennoa matches on and the address it wants. */
  customer: InvoiceCustomerRow;
  /** The month invoiced, as its first day (`YYYY-MM-01`). */
  monthStart: string;
  /**
   * Our provisional number for the invoice — the month and the customer's own
   * Fennoa number. **Fennoa assigns the real one when the invoice is sent**, so
   * this exists to identify the file rather than the invoice, and re-exporting a
   * month produces the same number again however the month's data has moved.
   */
  invoiceNumber: string;
  /** `CCYYMMDD` — the first day of the month *after* the one invoiced. */
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
 * Why a file cannot be produced.
 *
 * - `unknown_customer` — nothing in this month is billed to that customer. It
 *   is what a stale link or a hand-typed id reaches, and it is not an error
 *   about the customer: the customer may exist and simply have had no clubs
 *   running.
 * - `club_without_fee` — at least one club that **ran** this month has no
 *   per-session fee. **The whole file is refused rather than the club being
 *   dropped**, because a file that silently omits a club that ran is a total
 *   that is short, and a short total is the one thing nobody downstream
 *   catches. A club that recorded nothing is not in this count: it puts no row
 *   and no money on the file whatever its fee, so it cannot make the file
 *   wrong — its missing fee is a data problem, reported where data problems
 *   are, on the club's own line and on the admin dashboard.
 * - `nothing_to_invoice` — every one of the customer's clubs recorded no
 *   sessions. An invoice for nothing is a document somebody has to explain.
 */
export type FinvoiceBlockedReason = "club_without_fee" | "nothing_to_invoice";

export type FinvoiceRefusalReason = FinvoiceBlockedReason | "unknown_customer";

export interface FinvoiceRefusal {
  ok: false;
  reason: FinvoiceRefusalReason;
  /**
   * How many of the customer's clubs ran this month with no fee set. Zero for
   * the other reasons.
   */
  clubsWithoutFee: number;
}

export type FinvoiceResult =
  | { ok: true; invoice: FinvoiceInvoice }
  | FinvoiceRefusal;

/**
 * Whether a customer's month can become a file, and why not where it cannot.
 *
 * `unknown_customer` is not among its answers by construction: a summary in
 * hand is a customer the month knows about, so that refusal belongs to the
 * lookup rather than to the readiness.
 */
export type FinvoiceReadiness =
  | { ok: true }
  | { ok: false; reason: FinvoiceBlockedReason; clubsWithoutFee: number };

/**
 * Whether a customer's month can become a file, from the facts the ledger's
 * build already collected.
 *
 * Exported so the page and the route answer the question with the same code:
 * the page disables a download and says why, the route answers 409 and says the
 * same thing, and neither re-derives the rule.
 *
 * **What it asks is whether the FILE would be wrong, never whether the data
 * is.** Those are different questions with different readers: a fee nobody has
 * set is an admin error, and it is already named on the club's own line in the
 * ledger and raised as an attention item on the admin dashboard. A refusal here
 * on top of that is a third alarm for the same thing — and a wrong one where the
 * club never met, because such a club is on no invoice at all and its price
 * therefore changes no figure in the file.
 */
export function finvoiceReadiness(
  summary: InvoiceCustomerSummary,
): FinvoiceReadiness {
  if (summary.clubsThatRanWithoutFee > 0) {
    return {
      ok: false,
      reason: "club_without_fee",
      clubsWithoutFee: summary.clubsThatRanWithoutFee,
    };
  }
  if (summary.recordedCount === 0) {
    return { ok: false, reason: "nothing_to_invoice", clubsWithoutFee: 0 };
  }
  return { ok: true };
}

export interface BuildFinvoiceInvoiceArgs {
  /** The month, already built — the same view the ledger renders. */
  view: MunicipalityInvoicingView;
  /** Which of the month's customers the file is for. */
  customerId: string;
}

export function buildFinvoiceInvoice({
  view,
  customerId,
}: BuildFinvoiceInvoiceArgs): FinvoiceResult {
  const position = view.customers.findIndex(
    (one) => one.customer.id === customerId,
  );
  if (position === -1) {
    return { ok: false, reason: "unknown_customer", clubsWithoutFee: 0 };
  }

  const summary = view.customers[position];
  const readiness = finvoiceReadiness(summary);
  if (!readiness.ok) return readiness;

  // Only the clubs that actually ran get a row. A club with a fee and no
  // sessions is not a zero line — it is a club that was not delivered this
  // month, and a row worth €0.00 invites the buyer to ask what it is.
  const rows = summary.clubs
    .filter((club) => club.recordedCount > 0)
    .map((club, index) => buildRow(club, index + 1));

  // Only reachable where every club with a fee recorded nothing, which
  // `finvoiceReadiness` has already refused — kept because the filter above is
  // what decides it, and a zero-row invoice must never be serialized.
  if (rows.length === 0) {
    return { ok: false, reason: "nothing_to_invoice", clubsWithoutFee: 0 };
  }

  const invoiceDate = monthsAfter(view.monthStart, 1);
  const customer = stripZeroWidthFromCustomer(summary.customer);

  return {
    ok: true,
    invoice: {
      customer,
      monthStart: view.monthStart,
      invoiceNumber: provisionalInvoiceNumber(
        customer,
        view.monthStart,
        position,
      ),
      invoiceDate: compactDate(invoiceDate),
      dueDate: compactDate(
        addCalendarDays(invoiceDate, FINVOICE_PAYMENT_TERM_DAYS),
      ),
      freeText: freeTextFor(customer, view.monthStart),
      rows,
      // The three totals are the sums of the rows and nothing else, which is
      // what makes the invoice foot by construction.
      netCents: sumCents(rows.map((row) => row.netCents)),
      vatCents: sumCents(rows.map((row) => row.vatCents)),
      grossCents: sumCents(rows.map((row) => row.grossCents)),
    },
  };
}

export interface BuildFinvoiceForMonthArgs {
  /** One month of the invoicing document, exactly as the page's route reads it. */
  snapshot: MunicipalityInvoicingSnapshot;
  /** Which of the month's customers the file is for. */
  customerId: string;
  /** Request-stable "now" — what decides which of a club's dates have arrived. */
  now: Date;
}

/**
 * The whole export in one call: build the month, then build the customer's
 * invoice out of it.
 *
 * It exists so the route imports one module rather than two, and so the
 * export's locale is decided here rather than restated at every call site. The
 * file goes to a Finnish municipality's accounts payable, so it is built in
 * Finnish whatever locale the admin who asked for it reads the ledger in.
 */
export function buildFinvoiceForMonth({
  snapshot,
  customerId,
  now,
}: BuildFinvoiceForMonthArgs): FinvoiceResult {
  const view = buildMunicipalityInvoicing({
    snapshot,
    locale: FINVOICE_LOCALE,
    now,
  });
  return buildFinvoiceInvoice({ view, customerId });
}

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

function buildRow(club: InvoiceClub, rowNumber: number): FinvoiceRow {
  // Non-null by `finvoiceReadiness`, which refuses the whole file when any club
  // that ran has no fee — and only a club that ran becomes a row. Coerced
  // rather than asserted so a future
  // caller that skipped the check produces a visible zero rather than a crash
  // halfway through writing a file.
  const unitPriceCents = club.feeCents ?? 0;
  const netCents = sumCents([unitPriceCents * club.recordedCount]);
  const vatCents = vatOf(netCents);

  return {
    rowNumber,
    clubId: club.id,
    text: rowText(club),
    sessions: club.recordedCount,
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
function freeTextFor(customer: InvoiceCustomerRow, monthStart: string): string {
  const lines: string[] = [];
  const own = customer.invoice_text?.trim();
  if (own !== undefined && own !== "") {
    lines.push(own.replace(/\r\n?/g, "\n"));
  }
  lines.push(`Laskutuskausi ${billingPeriodLabel(monthStart)}`);
  lines.push(FINVOICE_ROWS_EXPLANATION);
  return lines.join("\n");
}

/** `5/26` for May 2026 — the month unpadded, the year in two digits. */
function billingPeriodLabel(monthStart: string): string {
  const month = Number(monthStart.slice(5, 7));
  return `${month}/${monthStart.slice(2, 4)}`;
}

/** `2026-06-01` → `20260601`, which is what `Format="CCYYMMDD"` means. */
function compactDate(date: string): string {
  return date.replace(/-/g, "");
}

/**
 * Our provisional number for a month's file: the month, then the digits of the
 * customer's Fennoa number. `F0037` in May 2026 is `2026050037`.
 *
 * **Fennoa assigns the real invoice number on send**, so this one never reaches
 * an accounting ledger and the export stays stateless — nothing is written when
 * a file is produced, and producing one twice produces the same file. What the
 * number has to be is numeric and greater than 100, which is Fennoa's own rule
 * for an imported identifier: the `YYYYMM` alone already clears that, and the
 * customer's digits only make it longer.
 *
 * **It is derived from the customer rather than from the customer's place in
 * the month**, because a re-export has to carry the same number as the export it
 * replaces, whatever changed in between — and a position is not a property of
 * the customer at all. Link one more club to a new buyer and every later
 * customer's position shifts by one, so a file downloaded again after that edit
 * would come back under a different number and read as a second invoice for the
 * same month. A Fennoa number belongs to the customer, does not move, and is
 * unique across customers, which makes the number both stable across data
 * changes and unique within a month by construction.
 */
function provisionalInvoiceNumber(
  customer: InvoiceCustomerRow,
  monthStart: string,
  position: number,
): string {
  const yearMonth = `${monthStart.slice(0, 4)}${monthStart.slice(5, 7)}`;
  const digits = customer.fennoa_customer_no.replace(/\D/g, "");
  // A customer number with no digit in it is not a shape Fennoa issues, but the
  // column is free text, so there has to be an answer: the customer's 1-based
  // position in the month, padded to four. It is stable only for as long as the
  // month's customer list is, which is the most a number carrying nothing of the
  // customer's own can promise.
  const tail = digits === "" ? String(position + 1).padStart(4, "0") : digits;
  return `${yearMonth}${tail}`;
}
