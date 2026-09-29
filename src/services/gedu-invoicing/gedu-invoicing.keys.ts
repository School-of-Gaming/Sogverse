/**
 * One key per month and per reader, because each is a different document from
 * a different call. The admin's month and a gedu's own month sit under one
 * root so a write that moves an invoice — a fee edited on a product, a
 * substitution seated, a session cancelled — can invalidate
 * `geduInvoicingKeys.all` and have every month follow.
 *
 * Kept out of `gedu-invoicing.queries.ts` for the reason the municipality
 * invoicing keys are: that file is `"use client"`, and a route hydrating this
 * cache server-side has to name the very key the hook reads.
 */
export const geduInvoicingKeys = {
  all: ["gedu-invoicing"] as const,
  /** Every gedu's month, the admin read. `monthStart` is `YYYY-MM-01`. */
  adminMonth: (monthStart: string) =>
    [...geduInvoicingKeys.all, "admin", monthStart] as const,
  /** The signed-in gedu's own month. `monthStart` is `YYYY-MM-01`. */
  myMonth: (monthStart: string) =>
    [...geduInvoicingKeys.all, "mine", monthStart] as const,
};
