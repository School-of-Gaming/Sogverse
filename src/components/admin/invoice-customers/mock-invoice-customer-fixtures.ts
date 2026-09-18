import type { InvoiceCustomerRow } from "@/services/invoice-customers";

/**
 * Fixtures for the invoice-customer preview scenes.
 *
 * **Four scenarios, and each pair is two states that cannot share a render.**
 * A list with customers in it and a list with none are two pages; a create form
 * and a form that has just been refused are two more. Nothing else here earns a
 * link: every field is on screen in both form scenarios, and a second list would
 * only be the same table with different words in it.
 *
 * **The names are the ones the invoicing ledger's own fixtures use.** The two
 * scenes are windows on one invented world, and a reviewer who opens both should
 * not meet two different Tampereas. They are not *imported* from there because
 * that module's fixtures build an invoicing document — a month of clubs and
 * sessions with the customer embedded in each club — and reaching into it for a
 * row list would couple this page's preview to the shape of that page's wire
 * contract.
 *
 * The municipality names are real, for the reason the ledger's fixtures state:
 * a Finnish reader recognises a row by them. Everything invented around them —
 * the customer numbers, the departments, the association, the streets and the
 * references — is invented, because a customer number or a street that belonged
 * to a real buyer would be a preview that looks like live data.
 */
export const INVOICE_CUSTOMER_SCENARIOS = [
  "list",
  "list-empty",
  "form-new",
  "form-refused",
] as const;

export type InvoiceCustomerPreviewScenario =
  (typeof INVOICE_CUSTOMER_SCENARIOS)[number];

export function isInvoiceCustomerScenario(
  value: string,
): value is InvoiceCustomerPreviewScenario {
  return (INVOICE_CUSTOMER_SCENARIOS as readonly string[]).includes(value);
}

/**
 * The customers on file, in the order the read delivers them: by invoice name,
 * then by id.
 *
 * Sorted here by hand rather than at render, because that is what the live page
 * receives — the table renders what it is handed and has no opinion about order,
 * so a fixture in the wrong order would be showing a page the database cannot
 * produce.
 *
 * Three of the rows are the reason the schema links a customer to a *club*
 * rather than to a municipality: Tampere is two customers, because two
 * departments buy under two agreements, and the association buys clubs that run
 * in a municipality it is not.
 */
export const INVOICE_CUSTOMER_FIXTURES: readonly InvoiceCustomerRow[] = [
  {
    id: "preview-invoice-customer-espoo",
    fennoa_customer_no: "F0204",
    invoice_name: "Espoon kaupunki",
    street: "Virastokuja 1",
    postal_code: "02070",
    city: "Espoo",
    country_code: "FI",
    your_reference: "TIL-2026-0418",
    invoice_text: null,
  },
  {
    id: "preview-invoice-customer-lekvanner",
    fennoa_customer_no: "F0219",
    invoice_name: "Föreningen Lekvänner rf",
    street: "Sjöstigen 12 A",
    postal_code: "01300",
    city: "Vantaa",
    country_code: "FI",
    your_reference: null,
    invoice_text: null,
  },
  {
    id: "preview-invoice-customer-helsinki",
    fennoa_customer_no: "F0207",
    invoice_name: "Helsingin kaupunki",
    street: "Virastokatu 3",
    postal_code: "00099",
    city: "Helsinki",
    country_code: "FI",
    your_reference: "PO 4471182",
    invoice_text: "Laskutusviite merkittävä jokaiselle riville.",
  },
  {
    id: "preview-invoice-customer-oulu",
    fennoa_customer_no: "F0224",
    invoice_name: "Oulun kaupunki",
    street: "Pohjoisväylä 9",
    postal_code: "90015",
    city: "Oulu",
    country_code: "FI",
    your_reference: null,
    invoice_text: null,
  },
  {
    id: "preview-invoice-customer-tampere-schools",
    fennoa_customer_no: "F0212",
    invoice_name: "Tampereen kaupunki, kasvatus- ja opetuspalvelut",
    street: "Opintie 14",
    postal_code: "33101",
    city: "Tampere",
    country_code: "FI",
    your_reference: "KASVA-2026-310",
    invoice_text: null,
  },
  {
    id: "preview-invoice-customer-tampere-library",
    fennoa_customer_no: "F0211",
    invoice_name: "Tampereen kaupunki, kirjastopalvelut",
    street: "Kirjastokuja 5",
    postal_code: "33101",
    city: "Tampere",
    country_code: "FI",
    your_reference: "KIRJ-2026-77",
    invoice_text: null,
  },
  {
    id: "preview-invoice-customer-turku",
    fennoa_customer_no: "F0221",
    invoice_name: "Turun kaupunki",
    street: "Raatihuoneenkuja 2",
    postal_code: "20101",
    city: "Turku",
    country_code: "FI",
    your_reference: null,
    invoice_text: null,
  },
];

/**
 * The customer the refused-save scenario opens on.
 *
 * The one row carrying both optional fields, so the form scenario that shows an
 * error is also the one that shows every field with something in it — the
 * create scenario beside it shows them all empty, and between the two there is
 * no field a reviewer has to imagine.
 */
export const INVOICE_CUSTOMER_EDIT_FIXTURE: InvoiceCustomerRow =
  INVOICE_CUSTOMER_FIXTURES[2];

/**
 * What the database says when a Fennoa number is already taken, shaped exactly
 * as PostgREST delivers it.
 *
 * The scene throws this rather than a plain `Error` because the form's job on
 * this path is to *recognise* a unique violation and say something an admin can
 * act on in place of Postgres's own sentence about a constraint name. A fixture
 * that threw an `Error` would exercise the generic branch and show a reviewer
 * the wrong message.
 */
export const INVOICE_CUSTOMER_DUPLICATE_REFUSAL = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "invoice_customers_fennoa_customer_no_key"',
  details: null,
  hint: null,
};
