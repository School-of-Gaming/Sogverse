import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditInvoiceCustomerPage } from "@/components/admin/invoice-customers/edit-invoice-customer-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminInvoiceCustomerEdit") };
}

export default async function InvoiceCustomerRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditInvoiceCustomerPage customerId={id} />;
}
