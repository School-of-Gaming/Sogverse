import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminHub } from "@/components/admin/hubs/admin-hub";
import { AdminInvoiceCustomersView } from "@/components/admin/invoice-customers/admin-invoice-customers-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminInvoiceCustomers") };
}

export default function InvoiceCustomersPage() {
  return (
    <AdminHub hub="invoicing">
      <AdminInvoiceCustomersView />
    </AdminHub>
  );
}
