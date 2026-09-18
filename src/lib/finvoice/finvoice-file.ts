/**
 * The two strings that connect the ledger to the download: where a customer's
 * file is fetched from, and what it is called once it lands.
 *
 * Both live here rather than at either end, because a page that linked to one
 * path while the route answered another would fail as a 404 the reader has no
 * way to diagnose, and a filename the CFO sorts a download folder by is part of
 * the export's contract with them rather than an incidental header value.
 */

/**
 * `GET /api/admin/municipality-invoicing/finvoice?month=…&customer=…`
 *
 * A bare path, not the app's wrapped `Link`: an API response has no locale, and
 * the proxy's locale ladder carves `/api/*` out for exactly that reason.
 */
export function finvoiceHref(monthStart: string, customerId: string): string {
  const params = new URLSearchParams({
    month: monthStart.slice(0, 7),
    customer: customerId,
  });
  return `/api/admin/municipality-invoicing/finvoice?${params.toString()}`;
}

/**
 * `invoice_202605_F0204.xml` — the month, then the Fennoa customer number.
 *
 * That order is the useful one: a folder of a month's downloads sorts into
 * months first and customers within them, which is how the CFO works through
 * an import run.
 *
 * **Reduced to ASCII.** A customer number is `F0037`-shaped in practice, but it
 * is free text in the database, and a `Content-Disposition` filename carrying a
 * quote, a semicolon or a non-ASCII byte is a header a browser may read as two
 * parameters. Anything outside the safe set becomes an underscore rather than
 * being dropped, which is what the substitution guarantees: a name that is
 * always non-empty and always safe to put in the header. It does not guarantee
 * distinctness — `F 37` and `F/37` both come out `F_37` — but two customers
 * whose numbers differ only in characters a filename cannot carry is not a shape
 * Fennoa issues, and the file's own contents name the buyer either way.
 */
export function finvoiceFileName(
  monthStart: string,
  fennoaCustomerNo: string,
): string {
  const yearMonth = `${monthStart.slice(0, 4)}${monthStart.slice(5, 7)}`;
  const safe = fennoaCustomerNo.replace(/[^A-Za-z0-9._-]/g, "_");
  return `invoice_${yearMonth}_${safe}.xml`;
}
