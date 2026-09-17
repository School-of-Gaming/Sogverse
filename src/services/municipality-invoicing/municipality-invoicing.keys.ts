/**
 * One key per month, because the month is what the read is about.
 *
 * The page navigates months by URL, and each month is a different document from
 * a different call — so a key that did not carry the month would have one cache
 * entry flipping between twelve answers, and stepping back to a month just
 * looked at would refetch it. The hierarchy above it is written out so any
 * write that could change what an invoice says can invalidate
 * `municipalityInvoicingKeys.all` and have every month follow: the fee lives on
 * the product, and an admin editing a product is the write that moves it.
 *
 * **Deliberately not in `municipality-invoicing.queries.ts`,** for the same
 * reason the admin dashboard's factory is not in its own: that file is
 * `"use client"`, so a server component importing from it gets a client
 * reference rather than the object. The route hydrates this cache entry
 * server-side and has to name the very key the hook reads.
 */
export const municipalityInvoicingKeys = {
  all: ["municipality-invoicing"] as const,
  /** `monthStart` is the month's first day, `YYYY-MM-01`. */
  month: (monthStart: string) =>
    [...municipalityInvoicingKeys.all, "month", monthStart] as const,
};
