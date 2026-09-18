import { z } from "zod";

/**
 * Contracts for the Fennoa invoice customers — the buyers a municipality club's
 * invoice is addressed to.
 *
 * There is no API route here and so no request/response pair: both writes are
 * admin-guarded RPCs the caller's own session client calls, and the read is a
 * plain table read under the table's admin-only SELECT policy. What this module
 * holds instead is the two shapes everything else in the app agrees on — the
 * row as it is stored and emitted, and what an admin may say when creating or
 * editing one.
 *
 * **The vocabulary is the database's**, deliberately: `fennoa_customer_no`,
 * `your_reference`, `invoice_text`. The row schema is parsed against real
 * Postgres output by the DB tests — both directly and inside the municipality
 * invoicing document, which embeds it — so a renamed column fails loudly rather
 * than arriving as `undefined` somewhere in a generated XML file.
 */

/**
 * One customer, exactly as `invoice_customers` stores it minus its timestamps.
 *
 * This is the shape the Finvoice serializer reads: the number Fennoa matches
 * the buyer on, the name that must appear on the invoice, the postal address
 * the import demands inside the file even though the customer card holds one,
 * and the two optional fields a customer may or may not have asked for.
 *
 * The timestamps are absent because nothing renders them and the invoicing
 * document does not carry them — a schema wider than the RPC emits would fail
 * the parse the DB test runs.
 */
export const invoiceCustomerRow = z.object({
  id: z.string(),
  /** The customer's number in Fennoa, e.g. `F0037`. Unique, and the join key. */
  fennoa_customer_no: z.string(),
  /** The buyer's name as it must read on the invoice. */
  invoice_name: z.string(),
  street: z.string(),
  postal_code: z.string(),
  city: z.string(),
  /** ISO 3166-1 alpha-2, uppercase. `FI` for every customer today. */
  country_code: z.string(),
  /** The buyer's own reference — a PO number or a contact. Null for most. */
  your_reference: z.string().nullable(),
  /** Extra free text the customer wants on every invoice. Null for most. */
  invoice_text: z.string().nullable(),
});

/** One customer as every reader of this feature deals with it. */
export type InvoiceCustomerRow = z.infer<typeof invoiceCustomerRow>;

/**
 * The columns every read of `invoice_customers` names, matching the schema
 * above.
 *
 * A **literal**, not a join of the schema's keys: the Supabase client infers a
 * response's shape from the *type* of the select string, and a string built at
 * runtime widens to `string` and takes the whole row type with it. Spelled out
 * rather than `*` so the timestamps — which nothing renders — stay off the wire
 * and the read cannot quietly widen.
 */
export const INVOICE_CUSTOMER_COLUMNS =
  "id, fennoa_customer_no, invoice_name, street, postal_code, city, country_code, your_reference, invoice_text";

/**
 * A required address field: trimmed, and non-empty once trimmed.
 *
 * The trim is a transform rather than a check, so what reaches the RPC is what
 * the table will store — the RPC trims again, and the CHECK behind it refuses a
 * blank whatever route a row arrives by, which is the layering this repo asks
 * for: the schema is the message an admin reads, the constraint is the
 * guarantee.
 */
const requiredField = z.string().trim().min(1, "This field is required");

/**
 * An optional field: trimmed, and folded to null when it comes out empty.
 *
 * "No reference" is one state rather than two — the table's CHECK refuses a
 * blank string outright — so an emptied input has to become `null` here rather
 * than travelling as `""` and being refused.
 */
const optionalField = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable();

/**
 * What an admin may say when creating or editing a customer.
 *
 * Keyed in the row's own vocabulary, minus `id`, so an edit form can seed
 * itself from a row with nothing to rename. Every field is required on the
 * wire, and the two nullable ones are required-**nullable** for the reason
 * `tag` is on a product: `update_invoice_customer` assigns every editable
 * column on every call and both parameters default to NULL, so an omitted field
 * would clear a reference nobody asked to clear. Demanding the field is what
 * makes clearing a deliberate `null`.
 *
 * `country_code` is upper-cased rather than merely checked, so the one legal
 * spelling is what reaches the column — the CHECK on the table admits uppercase
 * only, and an admin typing `fi` meant Finland rather than a validation error.
 * The shape is all that is checked: which countries we bill in is contract data
 * that moves as agreements land, so a list here would need a deploy per
 * country and would turn an already-stored code into a refusal.
 */
export const invoiceCustomerInput = z.object({
  fennoa_customer_no: requiredField,
  invoice_name: requiredField,
  street: requiredField,
  postal_code: requiredField,
  city: requiredField,
  country_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a two-letter country code, e.g. FI"),
  your_reference: optionalField,
  invoice_text: optionalField,
});

/**
 * What the create and update calls take. One type for both: the two RPCs assign
 * the same columns, and a separate update shape would only differ by carrying
 * the id — which the service takes as its own argument, the way every other
 * update in this app does.
 */
export type InvoiceCustomerInput = z.input<typeof invoiceCustomerInput>;

/** The same shape after parsing — blanks folded to null, country upper-cased. */
export type InvoiceCustomerInputParsed = z.output<typeof invoiceCustomerInput>;
