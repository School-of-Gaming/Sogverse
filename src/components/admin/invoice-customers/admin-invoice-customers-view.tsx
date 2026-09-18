"use client";

import { useInvoiceCustomers } from "@/services/invoice-customers";
import { AdminInvoiceCustomersPage } from "./admin-invoice-customers-page";

/**
 * The live data shell for `/admin/invoice-customers`.
 *
 * One read, straight into the body beside it. It exists as its own component
 * for the reason every scene in this app has one: the body it wraps takes rows
 * and nothing else, so the preview renders the same body over fixtures and the
 * two cannot drift into a second copy of the table.
 */
export function AdminInvoiceCustomersView() {
  const { data, isPending } = useInvoiceCustomers();

  return (
    <AdminInvoiceCustomersPage
      customers={data ?? []}
      settled={!isPending}
    />
  );
}
