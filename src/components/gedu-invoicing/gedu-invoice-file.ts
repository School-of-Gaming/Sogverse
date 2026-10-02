import type { SupportedLocale } from "@/lib/constants/locales";
import { slugify } from "@/lib/slug";

/**
 * Where a gedu's month is downloaded from and what the file is called — the
 * half of the exports the page and the route both need, kept free of anything
 * server-only so the page can link to the route without bundling the builders.
 */

export const GEDU_INVOICE_EXPORT_FORMATS = ["csv", "pdf"] as const;

export type GeduInvoiceExportFormat =
  (typeof GEDU_INVOICE_EXPORT_FORMATS)[number];

/**
 * The route's address for one month in one format, worded in `locale`.
 *
 * The locale travels in the link because the file is worded in the language
 * of the page it was downloaded from, and the page's language is its URL's —
 * which a route outside the `[locale]` tree cannot see.
 */
export function geduInvoiceExportHref(
  monthStart: string,
  format: GeduInvoiceExportFormat,
  locale: SupportedLocale,
): string {
  const params = new URLSearchParams({
    month: monthStart.slice(0, 7),
    format,
    locale,
  });
  return `/api/gedu/invoicing/export?${params.toString()}`;
}

/**
 * `sog-gedu-invoicing-2026-09-maija-virtanen.pdf` — the month, then the gedu.
 *
 * The name is in it because the PDF travels: it is attached to the invoice a
 * gedu sends School of Gaming, where a month's statements from every gedu land
 * in one inbox. It is ASCII-folded so the header needs no RFC 5987 encoding,
 * and a name with no Latin letter in it is simply left out.
 */
export function geduInvoiceFileName(
  monthStart: string,
  gedu: { firstName: string; lastName: string },
  format: GeduInvoiceExportFormat,
): string {
  const name = slugify(`${gedu.firstName} ${gedu.lastName}`);
  const stem = `sog-gedu-invoicing-${monthStart.slice(0, 7)}`;
  return `${name === "" ? stem : `${stem}-${name}`}.${format}`;
}
