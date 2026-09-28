/**
 * The company facts every municipality invoice carries, and nothing else.
 *
 * **These are facts about School of Gaming's Fennoa setup, established with the
 * CFO on 2026-09-15 by importing files generated from production data.** They
 * are constants rather than environment variables on purpose: an environment
 * variable is for a value that differs between deployments, and none of these
 * does — there is one company, one bank account, one VAT registration, one
 * sales account and one cost dimension, and a staging deployment that invoiced
 * from a different IBAN would be a worse answer than one that invoiced from
 * this one. Being in the repo is also what lets the serializer's tests assert
 * the whole document rather than the half of it that is not configuration.
 *
 * What is deliberately **not** here: payment terms, e-invoice routing and
 * department names. Those live on the buyer's own Fennoa customer card, and
 * Fennoa applies them when the invoice is sent. Sending them in the file would
 * be a second copy of something the accounting system already owns.
 *
 * The invoicing rules these serve are written out in
 * `src/components/admin/municipality-invoicing/CLAUDE.md`.
 */

/** The seller — School of Gaming, as Fennoa and the tax office know it. */
export const FINVOICE_SELLER = {
  /** The Finnish business ID, in its hyphenated form. */
  partyIdentifier: "3110461-1",
  organisationName: "School of Gaming Galactic Oy",
  streetName: "Isokatu 56",
  townName: "OULU",
  postCodeIdentifier: "90100",
  countryCode: "FI",
  iban: "FI6717453000236887",
  bic: "NDEAFIHH",
  /** The VAT number, in the un-hyphenated form a VAT registration takes. */
  vatRegistrationText: "FI31104611",
} as const;

/**
 * The transmission envelope's sender.
 *
 * `FromIdentifier` is the company's OVT (EDI) code and `FromIntermediator` the
 * operator's. The receiver's half of the envelope is sent **empty**: Fennoa
 * resolves the buyer's e-invoice address from the customer card when it sends,
 * and a routing address stated here would be a second copy of it that can go
 * stale.
 */
export const FINVOICE_TRANSMISSION = {
  fromIdentifier: "003731104611",
  fromIntermediator: "003721291126",
} as const;

/**
 * The one article every row of a municipality invoice is booked to: youth work.
 *
 * One article rather than one per club because that is what the accounting
 * needs — the club is named in the row's own free text, and an article per club
 * would be a chart of accounts that grows with the sales pipeline.
 */
export const FINVOICE_ARTICLE = {
  identifier: "2100",
  name: "Nuorisotyö",
} as const;

/** The cost dimension every row is tagged with, in both spellings Fennoa reads. */
export const FINVOICE_ROW_DIMENSION = "25000";

/** The unit a delivered quantity is counted in: *kerta*, a session. */
export const FINVOICE_QUANTITY_UNIT_CODE = "krt";

/**
 * VAT, as a rate in **per mille** and as the text the file states it in.
 *
 * The integer is what the money rule multiplies by, so the whole calculation
 * stays in integers: a rate held as `0.255` would put a float in the middle of
 * a line that has to foot exactly. The text is the file's own spelling, which
 * Finvoice wants with two decimals.
 */
export const FINVOICE_VAT_PER_MILLE = 255;
export const FINVOICE_VAT_RATE_TEXT = "25.50";

/** The overdue interest stated on every invoice, as the file spells it. */
export const FINVOICE_OVERDUE_FINE_TEXT = "7.50 %";

/** Our own contact on the invoice — who the buyer asks about it. */
export const FINVOICE_SELLER_REFERENCE = "Mikko Perälä";

/** Days from the invoice date to the due date. */
export const FINVOICE_PAYMENT_TERM_DAYS = 14;

/** The delivery method every one of these invoices states. */
export const FINVOICE_DELIVERY_METHOD_TEXT = "Electronic invoice";

/**
 * The line that tells the buyer what the rows are counting, in Finnish because
 * the invoice is Finnish whatever locale the admin who exported it reads in.
 */
export const FINVOICE_ROWS_EXPLANATION =
  "Laskurivillä kerhokerrat laskutuskaudella";

/** The invoice type every one of these is: an ordinary original sales invoice. */
export const FINVOICE_INVOICE_TYPE = {
  code: "INV01",
  text: "LASKU",
  originCode: "Original",
} as const;

/**
 * The locale the month is built in for an export, whatever the admin reads the
 * ledger in.
 *
 * The file goes to a Finnish municipality's accounts payable, so every name in
 * it — the municipality, the hall, the club — is the Finnish one, and the
 * weekday abbreviations in a row's schedule are Finnish too. An admin reading
 * the ledger in Swedish exports exactly the same bytes as one reading it in
 * Finnish.
 */
export const FINVOICE_LOCALE = "fi";

/**
 * The zone the file's own timestamp is stated in.
 *
 * The same zone the invoicing page measures its months in, and for the same
 * reason: the company and every municipality it bills are Finnish, and a
 * wall-clock timestamp carrying no zone is read as the writer's own.
 */
export const FINVOICE_TIME_ZONE = "Europe/Helsinki";
