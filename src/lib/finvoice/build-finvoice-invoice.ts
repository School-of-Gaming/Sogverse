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
 * ordinary states of an ordinary month rather than faults: a club whose fee
 * nobody has filled in yet, and a customer whose clubs all sat out the month.
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
   * Our provisional number for the invoice. **Fennoa assigns the real one when
   * the invoice is sent**, so this exists to identify the file rather than the
   * invoice, and re-exporting a month produces the same number again.
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
 * - `club_without_fee` — at least one of the customer's clubs has no
 *   per-session fee. **The whole file is refused rather than the club being
 *   dropped**, because a file that silently omits a club is a total that is
 *   short, and a short total is the one thing nobody downstream catches.
 * - `nothing_to_invoice` — every one of the customer's clubs recorded no
 *   sessions. An invoice for nothing is a document somebody has to explain.
 */
export type FinvoiceBlockedReason = "club_without_fee" | "nothing_to_invoice";

export type FinvoiceRefusalReason = FinvoiceBlockedReason | "unknown_customer";

export interface FinvoiceRefusal {
  ok: false;
  reason: FinvoiceRefusalReason;
  /** How many of the customer's clubs have no fee. Zero for the other reasons. */
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
 */
export function finvoiceReadiness(
  summary: InvoiceCustomerSummary,
): FinvoiceReadiness {
  if (summary.clubsWithoutFee > 0) {
    return {
      ok: false,
      reason: "club_without_fee",
      clubsWithoutFee: summary.clubsWithoutFee,
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

  return {
    ok: true,
    invoice: {
      customer: summary.customer,
      monthStart: view.monthStart,
      invoiceNumber: provisionalInvoiceNumber(view.monthStart, position),
      invoiceDate: compactDate(invoiceDate),
      dueDate: compactDate(
        addCalendarDays(invoiceDate, FINVOICE_PAYMENT_TERM_DAYS),
      ),
      freeText: freeTextFor(summary.customer, view.monthStart),
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
  // Non-null by `finvoiceReadiness`, which refuses the whole file when any of
  // the customer's clubs has no fee. Coerced rather than asserted so a future
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
 * Our provisional number for a month's file: the month, then the customer's
 * 1-based position in the month's customer list, padded to two digits.
 *
 * **Fennoa assigns the real invoice number on send**, so this one never reaches
 * an accounting ledger and the export stays stateless — nothing is written when
 * a file is produced, and producing one twice produces the same file. What the
 * number still has to be is numeric and greater than 100, which is Fennoa's own
 * rule for an imported identifier, and deterministic, so that a re-export after
 * a fee correction replaces the earlier file rather than looking like a second
 * invoice.
 *
 * Two digits is enough by a wide margin: it is the count of *customers billed
 * in one month*, which is a number of municipal agreements rather than a number
 * of clubs. A month with a hundred customers would roll into three digits and
 * stay both numeric and unique, so the padding is a shape rather than a limit.
 */
function provisionalInvoiceNumber(monthStart: string, position: number): string {
  const yearMonth = `${monthStart.slice(0, 4)}${monthStart.slice(5, 7)}`;
  return `${yearMonth}${String(position + 1).padStart(2, "0")}`;
}
