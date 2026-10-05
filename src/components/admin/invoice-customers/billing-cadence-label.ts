import type { InvoiceBillingCadence } from "@/types";

/**
 * Each billing cadence's word, as a key of the `admin.invoiceCustomers`
 * namespace — keyed concretely so the compile-time check on the namespace sees
 * every key, which a `cadence.${value}` template would hide from it.
 *
 * Shared by the form's select, the list's column and the invoicing ledger's
 * label for a customer in the middle of its period, so the three say the same
 * word for the same cadence.
 */
export const BILLING_CADENCE_LABEL = {
  monthly: "cadence.monthly",
  quarterly: "cadence.quarterly",
  half_yearly: "cadence.halfYearly",
} as const satisfies Record<InvoiceBillingCadence, string>;
