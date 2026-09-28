"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import {
  useInvoiceCustomer,
  useUpdateInvoiceCustomer,
} from "@/services/invoice-customers";
import { InvoiceCustomerForm } from "./invoice-customer-form";
import { InvoiceCustomerPageShell } from "./invoice-customer-page-shell";
import { invoiceCustomerDraft } from "./invoice-customer-draft";

/**
 * `/admin/invoice-customers/[id]` — one customer, which is its edit form.
 *
 * There is no read-only page between the list and the form. A customer is eight
 * fields with no history, no children and nothing derived from it; the list
 * already carries the three that tell two apart, and a detail page would be the
 * same eight values printed twice in one tree.
 *
 * **The title is the page's own and not the customer's name**, which is a layout
 * decision: the name arrives a round trip after the heading is painted, and a
 * heading that rewrites itself on the read's schedule can gain a line and push
 * the whole form down under a reader already looking at it. The name is the
 * first field in the form underneath, where it is also the thing being edited.
 *
 * **The form is keyed on the row rather than merely fed by it.** `useState`
 * seeds once, so a form mounted before the read answered would keep its blank
 * draft forever. Nothing is on screen to be pushed around by that — the card is
 * not rendered until there is a row — which is the same bargain the read's
 * absent loading state is: one indexed row by primary key, landing in a frame or
 * two, into a page whose heading and back link are already painted.
 */
export function EditInvoiceCustomerPage({
  customerId,
}: {
  customerId: string;
}) {
  const t = useTranslations("admin.invoiceCustomers");
  // The save button says what every other edit form in this app says, from the
  // one key they all share — there is nothing specific to a customer about it.
  const c = useTranslations("common");
  const router = useRouter();
  const { data: customer, isPending } = useInvoiceCustomer(customerId);
  const updateCustomer = useUpdateInvoiceCustomer();

  return (
    <InvoiceCustomerPageShell title={t("editPage.title")}>
      {customer && (
        <InvoiceCustomerForm
          key={customer.id}
          initialDraft={invoiceCustomerDraft(customer)}
          submitLabel={c("saveChanges")}
          onCancel={() => router.push(ROUTES.admin.invoiceCustomers)}
          onSubmit={async (input) => {
            await updateCustomer.mutateAsync({ id: customer.id, input });
            router.push(ROUTES.admin.invoiceCustomers);
          }}
        />
      )}

      {!isPending && !customer && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("notFound")}
          </CardContent>
        </Card>
      )}
    </InvoiceCustomerPageShell>
  );
}
