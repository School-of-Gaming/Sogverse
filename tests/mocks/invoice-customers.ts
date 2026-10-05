import type { InvoiceCustomerRow } from "@/services/invoice-customers";

/**
 * Invoice customers as the list read delivers them: by invoice name, then by id.
 * Two carry a reference and two do not, so a test can count either kind.
 */
export const INVOICE_CUSTOMERS: readonly InvoiceCustomerRow[] = [
  {
    id: "invoice-customer-espoo",
    fennoa_customer_no: "F0204",
    invoice_name: "Espoon kaupunki",
    street: "Virastokuja 1",
    postal_code: "02070",
    city: "Espoo",
    country_code: "FI",
    your_reference: "TIL-2026-0418",
    billing_cadence: "monthly",
    invoice_text: null,
  },
  {
    id: "invoice-customer-lekvanner",
    fennoa_customer_no: "F0219",
    invoice_name: "Föreningen Lekvänner rf",
    street: "Sjöstigen 12 A",
    postal_code: "01300",
    city: "Vantaa",
    country_code: "FI",
    your_reference: null,
    billing_cadence: "monthly",
    invoice_text: null,
  },
  {
    id: "invoice-customer-helsinki",
    fennoa_customer_no: "F0207",
    invoice_name: "Helsingin kaupunki",
    street: "Virastokatu 3",
    postal_code: "00099",
    city: "Helsinki",
    country_code: "FI",
    your_reference: "PO 4471182",
    billing_cadence: "monthly",
    invoice_text: "Laskutusviite merkittävä jokaiselle riville.",
  },
  {
    id: "invoice-customer-oulu",
    fennoa_customer_no: "F0224",
    invoice_name: "Oulun kaupunki",
    street: "Pohjoisväylä 9",
    postal_code: "90015",
    city: "Oulu",
    country_code: "FI",
    your_reference: null,
    billing_cadence: "half_yearly",
    invoice_text: null,
  },
];

/**
 * What PostgREST delivers when a Fennoa number is already taken — the wire
 * object, not an `Error`, because the form recognises the unique violation by
 * its code.
 */
export const INVOICE_CUSTOMER_DUPLICATE_REFUSAL = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "invoice_customers_fennoa_customer_no_key"',
  details: null,
  hint: null,
};
