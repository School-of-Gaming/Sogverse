import type { SupportedLocale } from "@/lib/constants/locales";
import type {
  GeduInvoice,
  GeduInvoiceClub,
  GeduInvoiceLine,
} from "./build-gedu-invoicing";
import {
  otherGeduName,
  STATUS_LABEL_KEY,
  type GeduInvoicingTranslator,
} from "./gedu-invoice-export";
import { ROLE_LABEL_KEY, SEGMENT_LABEL_KEY } from "./gedu-invoicing-labels";

/**
 * One gedu's month as CSV: raw rows for the gedu's own spreadsheet.
 *
 * **One row per dated line, of every kind** — paid, not recorded, upcoming,
 * cancelled and away — sorted by date, then club, so the file is the page's
 * dates laid flat. A line that does not pay carries an amount of `0,00`, so the
 * amount column sums to the invoice total; a line whose club has no fee set
 * leaves both money cells blank, because an unset fee is never zero.
 *
 * **Written for a Finnish Excel opened by double-click**, whatever the page's
 * locale: a byte-order mark so Excel reads UTF-8, semicolons because the comma
 * is the decimal separator there, a decimal comma with two decimals and no
 * thousands separator, CRLF line ends, and RFC 4180 quoting. The words —
 * headers, segments, roles, statuses — are in the page's locale.
 *
 * Pure: no clock, no I/O. The result is the whole file as a string, BOM
 * included, for a `text/csv; charset=utf-8` response.
 */
export function buildGeduInvoiceCsv({
  invoice,
  locale,
  t,
}: {
  invoice: GeduInvoice;
  /** For ordering club names on a shared date the way the reader sorts them. */
  locale: SupportedLocale;
  t: GeduInvoicingTranslator;
}): string {
  const header = [
    t("export.columnDate"),
    t("export.columnWeek"),
    t("export.columnSegment"),
    t("columnClub"),
    t("export.columnGroup"),
    t("export.columnLocation"),
    t("columnRole"),
    t("export.columnStatus"),
    t("export.columnOtherGedu"),
    t("export.columnFeeExclVat"),
    t("export.columnAmountExclVat"),
  ];

  const rows = csvLines(invoice, locale).map(({ club, line }) => [
    line.date,
    String(line.isoWeek),
    t(SEGMENT_LABEL_KEY[club.segment]),
    club.name,
    line.groupName,
    club.locationName ?? "",
    t(ROLE_LABEL_KEY[club.role]),
    t(STATUS_LABEL_KEY[line.kind]),
    otherGeduName(line) ?? "",
    club.feeCents === null ? "" : csvMoney(club.feeCents),
    club.feeCents === null
      ? ""
      : csvMoney(line.kind === "paid" ? club.feeCents : 0),
  ]);

  return (
    BYTE_ORDER_MARK +
    [header, ...rows]
      .map((fields) => fields.map(csvField).join(DELIMITER) + LINE_END)
      .join("")
  );
}

/** Every dated line of the month with the club line it sits under, in file order. */
export function csvLines(
  invoice: GeduInvoice,
  locale: SupportedLocale,
): { club: GeduInvoiceClub; line: GeduInvoiceLine }[] {
  return invoice.clubs
    .flatMap((club) => club.lines.map((line) => ({ club, line })))
    .sort(
      (a, b) =>
        // ISO dates order as strings.
        compare(a.line.date, b.line.date) ||
        a.club.name.localeCompare(b.club.name, locale) ||
        a.line.groupName.localeCompare(b.line.groupName, locale) ||
        // Primary before assistant, as the page orders a club's two lines.
        ROLE_RANK[a.club.role] - ROLE_RANK[b.club.role] ||
        compare(a.club.productId, b.club.productId),
    );
}

/** Cents as `1234,50`: decimal comma, two decimals, no thousands separator. */
export function csvMoney(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error(`csvMoney: not a non-negative integer of cents: ${cents}`);
  }
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return `${euros},${String(rest).padStart(2, "0")}`;
}

/** RFC 4180: quote a field holding the delimiter, a quote or a line break. */
export function csvField(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const ROLE_RANK = { primary: 0, assistant: 1 } as const satisfies Record<
  GeduInvoiceClub["role"],
  number
>;

const BYTE_ORDER_MARK = "﻿";
const DELIMITER = ";";
const LINE_END = "\r\n";

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
