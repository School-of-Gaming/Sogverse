import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewInvoiceCustomerPage } from "@/components/admin/invoice-customers/new-invoice-customer-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminInvoiceCustomerNew") };
}

export default function NewInvoiceCustomerRoute() {
  return <NewInvoiceCustomerPage />;
}
