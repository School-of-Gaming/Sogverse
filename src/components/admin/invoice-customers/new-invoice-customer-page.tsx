"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useCreateInvoiceCustomer } from "@/services/invoice-customers";
import { InvoiceCustomerForm } from "./invoice-customer-form";
import { InvoiceCustomerPageShell } from "./invoice-customer-page-shell";
import { emptyInvoiceCustomerDraft } from "./invoice-customer-draft";

/**
 * `/admin/invoice-customers/new` — the data shell around the create form.
 *
 * **The write goes client → RPC, with no API route between**, which is this
 * feature's own shape rather than a departure from the app's: a route exists
 * where a write needs a server-side secret (Stripe, Daily.co, the admin client),
 * and this one needs none. The table carries no write grant at all, so the
 * browser's only way in is an admin-guarded `SECURITY DEFINER` function that
 * makes the authorization decision before it reads an argument — the same guard
 * a route would have had to call, one hop earlier.
 */
export function NewInvoiceCustomerPage() {
  const t = useTranslations("admin.invoiceCustomers");
  const router = useRouter();
  const createCustomer = useCreateInvoiceCustomer();

  return (
    <InvoiceCustomerPageShell title={t("newPage.title")}>
      <InvoiceCustomerForm
        initialDraft={emptyInvoiceCustomerDraft()}
        submitLabel={t("newPage.submit")}
        onCancel={() => router.push(ROUTES.admin.invoiceCustomers)}
        onSubmit={async (input) => {
          await createCustomer.mutateAsync(input);
          // The list is where the new row is, and the mutation has already
          // invalidated it — so the page the admin lands on is the one that
          // proves the save landed.
          router.push(ROUTES.admin.invoiceCustomers);
        }}
      />
    </InvoiceCustomerPageShell>
  );
}
