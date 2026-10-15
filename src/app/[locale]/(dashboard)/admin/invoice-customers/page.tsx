import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminHub } from "@/components/admin/hubs/admin-hub";
import { AddInvoiceCustomerAction } from "@/components/admin/invoice-customers/admin-invoice-customers-page";
import { AdminInvoiceCustomersView } from "@/components/admin/invoice-customers/admin-invoice-customers-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminInvoiceCustomers") };
}

export default async function InvoiceCustomersPage() {
  const t = await getTranslations("admin.invoiceCustomers");

  return (
    <AdminHub
      hub="invoicing"
      description={t("subtitle")}
      action={<AddInvoiceCustomerAction />}
    >
      <AdminInvoiceCustomersView />
    </AdminHub>
  );
}
