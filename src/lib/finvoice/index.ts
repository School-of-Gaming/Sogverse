/**
 * **Finvoice** — the municipality invoice as Fennoa's import reads it.
 *
 * Two pure steps and one table of company facts: the built months of a
 * customer's billing period become one invoice, and that invoice becomes a
 * Finvoice 3.0 document. The period arithmetic — which calendar months a
 * monthly, quarterly or half-yearly customer's file covers — sits beside them.
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
  buildFinvoiceForPeriod,
  buildFinvoiceInvoice,
  customerFilesForMonth,
  customerMonths,
  finvoiceFileState,
  vatOf,
  type BuildFinvoiceForPeriodArgs,
  type BuildFinvoiceInvoiceArgs,
  type CustomerFile,
  type CustomerFilesForMonth,
  type FinvoiceFileState,
  type FinvoiceFileStateArgs,
  type FinvoiceInvoice,
  type FinvoiceRefusal,
  type FinvoiceRefusalReason,
  type FinvoiceResult,
  type FinvoiceRow,
} from "./build-finvoice-invoice";
export {
  MONTHS_PER_PERIOD,
  billingPeriodOf,
  earlierPeriodMonths,
  isPeriodEnd,
  type BillingPeriod,
} from "./billing-period";
export { serializeFinvoice } from "./serialize-finvoice";
export { finvoiceFileName, finvoiceHref } from "./finvoice-file";
export { FINVOICE_LOCALE, FINVOICE_TIME_ZONE } from "./finvoice-constants";
