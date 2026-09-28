import type { GeduInvoice } from "./build-gedu-invoicing";

/**
 * The gedus an admin's search leaves on the page: a case-insensitive substring
 * of the first name, the last name, the full name or the email. A blank query
 * keeps every gedu, and the order is the builder's.
 *
 * It narrows the list and nothing else — the month's figures are the whole
 * month's whatever is typed here.
 */
export function filterGeduInvoices(
  gedus: readonly GeduInvoice[],
  query: string,
): readonly GeduInvoice[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return gedus;

  return gedus.filter((gedu) =>
    [
      gedu.firstName,
      gedu.lastName,
      `${gedu.firstName} ${gedu.lastName}`,
      gedu.email,
    ].some((haystack) => haystack.toLowerCase().includes(needle)),
  );
}
