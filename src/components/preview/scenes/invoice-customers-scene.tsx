"use client";

import { useTranslations } from "next-intl";
import { AdminInvoiceCustomersPage } from "@/components/admin/invoice-customers/admin-invoice-customers-page";
import { InvoiceCustomerForm } from "@/components/admin/invoice-customers/invoice-customer-form";
import { InvoiceCustomerPageShell } from "@/components/admin/invoice-customers/invoice-customer-page-shell";
import {
  emptyInvoiceCustomerDraft,
  invoiceCustomerDraft,
} from "@/components/admin/invoice-customers/invoice-customer-draft";
import {
  INVOICE_CUSTOMER_DUPLICATE_REFUSAL,
  INVOICE_CUSTOMER_EDIT_FIXTURE,
  INVOICE_CUSTOMER_FIXTURES,
  type InvoiceCustomerPreviewScenario,
} from "@/components/admin/invoice-customers/mock-invoice-customer-fixtures";

/**
 * **Invoice customers** — the admin's list of Fennoa buyers and the form behind
 * it, over fixtures.
 *
 * Both bodies are the live ones. The list table takes its rows as a prop, so the
 * scene hands it fixtures where the route hands it a read; the form takes a
 * draft and a save function, so the scene hands it a save that refuses where the
 * pages hand it a mutation. **Nothing here touches the network and nothing needs
 * a query client to guarantee that** — neither body calls a hook, which is the
 * strongest form of the same promise the invoicing scene buys with a
 * never-refetching client.
 *
 * `settled` is passed true on both list scenarios: the read the live page waits
 * for has, as far as this page is concerned, already answered, and an empty list
 * that had not would be showing the wrong page.
 *
 * **A row's name still leaves the preview.** Each is a real link to the live
 * edit page for a fixture's id, which is the honest behaviour for a link whose
 * whole purpose is to be the way out of a row — and following one lands on that
 * page's not-found state, because no customer has the id a fixture carries.
 *
 * The refusal scenario is where the form's error state is judged, and it throws
 * the wire object rather than an `Error` so the form takes the branch it takes
 * live: a unique violation on the Fennoa number, re-worded into a sentence an
 * admin can act on instead of Postgres's own sentence about a constraint name.
 */
export function InvoiceCustomersScene({
  scenario,
}: {
  scenario: InvoiceCustomerPreviewScenario;
}) {
  const t = useTranslations("admin.invoiceCustomers");
  const c = useTranslations("common");

  if (scenario === "list" || scenario === "list-empty") {
    return (
      <AdminInvoiceCustomersPage
        customers={scenario === "list" ? INVOICE_CUSTOMER_FIXTURES : []}
        settled
      />
    );
  }

  const creating = scenario === "form-new";

  return (
    <InvoiceCustomerPageShell
      title={creating ? t("newPage.title") : t("editPage.title")}
    >
      <InvoiceCustomerForm
        initialDraft={
          creating
            ? emptyInvoiceCustomerDraft()
            : invoiceCustomerDraft(INVOICE_CUSTOMER_EDIT_FIXTURE)
        }
        submitLabel={creating ? t("newPage.submit") : c("saveChanges")}
        // Inert, and inert in the honest direction: a preview that navigated to
        // the live list would be a one-way door out of the scene.
        onCancel={() => {}}
        // Submitting the blank create form is refused by the contract before
        // this is reached, which is the state worth looking at there. A filled
        // one resolves and the button stays committed — live, that is the frame
        // in which the page leaves for the list, and a button that re-enabled on
        // the way out is the double-submit the flag exists to prevent.
        onSubmit={async () => {
          if (creating) return;
          throw INVOICE_CUSTOMER_DUPLICATE_REFUSAL;
        }}
      />
    </InvoiceCustomerPageShell>
  );
}
