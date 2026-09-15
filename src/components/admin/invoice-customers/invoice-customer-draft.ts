import {
  invoiceCustomerInput,
  type InvoiceCustomerInputParsed,
  type InvoiceCustomerRow,
} from "@/services/invoice-customers";

/**
 * The form's own state: one string per column, in the column's own name.
 *
 * **Strings all the way, including the two optional fields.** A textbox has one
 * empty value and the column has two — `NULL` and a string of spaces, the
 * second of which the table refuses outright — so the draft holds what was
 * typed and the contract is what folds a blank into the null the RPC wants.
 * Keeping a `string | null` here instead would mean the control had to decide
 * which of the two an empty box meant, on every keystroke.
 *
 * Keyed in the **database's** vocabulary rather than camelCase, because that is
 * the vocabulary the whole feature already speaks: a stored row seeds a draft
 * field by field with nothing to rename, and a validated draft is the RPC's
 * argument list with nothing to map.
 */
export interface InvoiceCustomerDraft {
  fennoa_customer_no: string;
  invoice_name: string;
  street: string;
  postal_code: string;
  city: string;
  country_code: string;
  your_reference: string;
  invoice_text: string;
}

/**
 * The fields in the order the form asks for them — who the buyer is, where it
 * is, then the two things it may have asked us to print.
 *
 * A tuple rather than a bare type, so a validation failure can be pointed at a
 * field and the page can name that field in a sentence.
 */
export const INVOICE_CUSTOMER_FIELDS = [
  "fennoa_customer_no",
  "invoice_name",
  "street",
  "postal_code",
  "city",
  "country_code",
  "your_reference",
  "invoice_text",
] as const satisfies readonly (keyof InvoiceCustomerDraft)[];

export type InvoiceCustomerField = (typeof INVOICE_CUSTOMER_FIELDS)[number];

/**
 * A blank draft for the create form.
 *
 * The country is the one field that opens with an answer in it, and the form
 * states that answer rather than asking for it: Finvoice is Finland's
 * e-invoicing format and a municipality club is a Finnish product, so every
 * customer this feature invoices is Finnish and there is no question here for
 * an admin to answer. The contract still enforces the two-letter shape rather
 * than pinning the value to `FI`, so a row that is not Finnish — one that
 * arrived some other way — survives a round trip through this form unharmed
 * instead of being silently rewritten.
 */
export function emptyInvoiceCustomerDraft(): InvoiceCustomerDraft {
  return {
    fennoa_customer_no: "",
    invoice_name: "",
    street: "",
    postal_code: "",
    city: "",
    country_code: "FI",
    your_reference: "",
    invoice_text: "",
  };
}

/** A stored row as the edit form opens it. */
export function invoiceCustomerDraft(
  row: InvoiceCustomerRow,
): InvoiceCustomerDraft {
  return {
    fennoa_customer_no: row.fennoa_customer_no,
    invoice_name: row.invoice_name,
    street: row.street,
    postal_code: row.postal_code,
    city: row.city,
    country_code: row.country_code,
    // The absent half of each optional column becomes the empty box it was
    // typed into, which is the same round trip the other direction: save an
    // untouched empty box and the contract folds it back to NULL.
    your_reference: row.your_reference ?? "",
    invoice_text: row.invoice_text ?? "",
  };
}

/**
 * What a draft is: either the RPC's arguments, or the first thing wrong with
 * it and which field it is wrong on.
 *
 * `reason` is a *kind* rather than a sentence: this module is pure and
 * locale-free, and the sentence an admin reads is assembled by the form out of
 * the field's own translated label. Two kinds is the whole list, because the
 * contract has two kinds of rule — a field that has to be there, and the one
 * field whose shape is checked.
 */
export type InvoiceCustomerDraftResult =
  | { ok: true; input: InvoiceCustomerInputParsed }
  | { ok: false; field: InvoiceCustomerField; reason: "required" | "shape" };

/**
 * Validate a draft against the service's own contract.
 *
 * **The contract is the rule and this is only its reader.** Everything the form
 * refuses is refused by `invoiceCustomerInput` — the trimming, the blank-folding
 * and the country's shape — so the form, the service and the CHECKs behind them
 * cannot drift into three different opinions about what a customer is.
 *
 * The kind is decided from the *value* rather than from the issue's own code: a
 * zod issue code is a property of the schema's spelling (a `regex` refusal today,
 * a `length` refusal if somebody rewrites the check tomorrow), while "the box is
 * empty" versus "what is in the box is not a country code" is a fact about what
 * the admin typed and is the distinction the sentence has to draw.
 */
export function validateInvoiceCustomerDraft(
  draft: InvoiceCustomerDraft,
): InvoiceCustomerDraftResult {
  const parsed = invoiceCustomerInput.safeParse(draft);
  if (parsed.success) return { ok: true, input: parsed.data };

  const field = firstFailingField(parsed.error.issues);
  return {
    ok: false,
    field,
    reason: draft[field].trim() === "" ? "required" : "shape",
  };
}

/**
 * The first field the contract complained about, in the order the form asks.
 *
 * Zod reports its issues in schema order, which happens to be the form's order
 * today — but "happens to" is exactly the kind of coupling that breaks quietly
 * when somebody reorders one of the two, so the field list is what decides, and
 * the admin is always sent to the topmost empty box rather than to whichever one
 * the schema mentioned first.
 */
function firstFailingField(
  issues: readonly { path: PropertyKey[] }[],
): InvoiceCustomerField {
  const failed = new Set(issues.map((issue) => String(issue.path[0])));
  return (
    INVOICE_CUSTOMER_FIELDS.find((field) => failed.has(field)) ??
    // Unreachable against this contract — every rule in it is attached to a
    // named field — and a throw here would turn a validation message into a
    // crash. The first field is where an admin would start reading anyway.
    INVOICE_CUSTOMER_FIELDS[0]
  );
}

/**
 * Why a save was refused, as the form has to say it.
 *
 * Three kinds, and the split is about who wrote the words:
 *
 * - **`duplicate`** — the unique index on the Fennoa number. Postgres says
 *   "duplicate key value violates unique constraint …", which names a constraint
 *   an admin has never heard of, so this one kind is re-worded by us.
 * - **`reason`** — anything else the database says. The two write RPCs raise
 *   `check_violation` carrying sentences that were *written to be read* ("A
 *   street, postal code and city are required — the Finvoice import refuses a
 *   file with no buyer address"), and re-wording those here would be a second
 *   copy of a rule that already exists in one place.
 * - **`unknown`** — anything that is not a wire error at all: a network fault, a
 *   bug. There is nothing to quote, so the form says so in its own words.
 */
export type InvoiceCustomerSaveFailure =
  | { kind: "duplicate" }
  | { kind: "reason"; reason: string }
  | { kind: "unknown" };

/** Postgres's unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

export function invoiceCustomerSaveFailure(
  error: unknown,
): InvoiceCustomerSaveFailure {
  if (typeof error !== "object" || error === null) return { kind: "unknown" };
  if (!("code" in error) || !("message" in error)) return { kind: "unknown" };

  const { code, message } = error;
  if (typeof code !== "string" || typeof message !== "string") {
    return { kind: "unknown" };
  }
  if (code === UNIQUE_VIOLATION) return { kind: "duplicate" };
  return message.length > 0
    ? { kind: "reason", reason: message }
    : { kind: "unknown" };
}
