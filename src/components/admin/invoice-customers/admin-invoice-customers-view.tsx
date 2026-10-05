"use client";

import { useInvoiceCustomers } from "@/services/invoice-customers";
import { AdminInvoiceCustomersPage } from "./admin-invoice-customers-page";

/**
 * The live data shell for `/admin/invoice-customers`.
 *
 * One read, straight into the body beside it, which takes rows and nothing
 * else.
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
