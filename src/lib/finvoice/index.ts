/**
 * **Finvoice** — the municipality invoice as Fennoa's import reads it.
 *
 * Two pure steps and one table of company facts: the month's built view becomes
 * one customer's invoice, and that invoice becomes a Finvoice 3.0 document.
 * Nothing here queries, and nothing here writes — an export is stateless,
 * because Fennoa assigns the real invoice number when the invoice is sent.
 *
 * It sits in `src/lib` rather than beside the page because the route layer is
 * what consumes it and no API route in this app reaches into a component
 * directory; the view type it reads comes the other way, which is the shape
 * several other modules here already have. The rules it implements — what
 * Fennoa needs, what refuses a file, and why the money is counted the way it
 * is — are written out in
 * `src/components/admin/municipality-invoicing/CLAUDE.md`.
 */

export {
  buildFinvoiceForMonth,
  buildFinvoiceInvoice,
  finvoiceReadiness,
  vatOf,
  type BuildFinvoiceForMonthArgs,
  type BuildFinvoiceInvoiceArgs,
  type FinvoiceBlockedReason,
  type FinvoiceInvoice,
  type FinvoiceReadiness,
  type FinvoiceRefusal,
  type FinvoiceRefusalReason,
  type FinvoiceResult,
  type FinvoiceRow,
} from "./build-finvoice-invoice";
export { serializeFinvoice } from "./serialize-finvoice";
export { finvoiceFileName, finvoiceHref } from "./finvoice-file";
export { FINVOICE_LOCALE, FINVOICE_TIME_ZONE } from "./finvoice-constants";
