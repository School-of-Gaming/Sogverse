"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { municipalityInvoicingKeys } from "@/services/municipality-invoicing";
import { InvoiceCustomersService } from "./invoice-customers.service";
import type { InvoiceCustomerInput } from "./invoice-customers.contracts";

export const invoiceCustomerKeys = {
  all: ["invoice-customers"] as const,
  // A grouping key with no query of its own: the list is what every picker and
  // the admin table read, so a create or an edit invalidates `all` and both
  // refresh without either mutation knowing which surface is on screen.
  list: () => [...invoiceCustomerKeys.all, "list"] as const,
  details: () => [...invoiceCustomerKeys.all, "detail"] as const,
  detail: (id: string) => [...invoiceCustomerKeys.details(), id] as const,
};

/**
 * Every invoice customer, ordered by invoice name.
 *
 * Admin-only by RLS rather than by anything here: the table's single policy is
 * the admin predicate, so a non-admin caller gets an empty list rather than an
 * error. No surface outside `/admin` mounts this.
 */
export function useInvoiceCustomers() {
  const supabase = getClient();
  const service = new InvoiceCustomersService(supabase);

  return useQuery({
    queryKey: invoiceCustomerKeys.list(),
    queryFn: () => service.listInvoiceCustomers(),
  });
}

/** One invoice customer by id. Nullable id so a caller can mount before a pick. */
export function useInvoiceCustomer(id: string | null | undefined) {
  const supabase = getClient();
  const service = new InvoiceCustomersService(supabase);

  return useQuery({
    queryKey: invoiceCustomerKeys.detail(id ?? ""),
    queryFn: () => service.getInvoiceCustomer(id ?? ""),
    enabled: !!id,
  });
}

export function useCreateInvoiceCustomer() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new InvoiceCustomersService(supabase);

  return useMutation({
    mutationFn: (input: InvoiceCustomerInput) =>
      service.createInvoiceCustomer(input),
    // RETURNED, not fired-and-forgotten: React Query awaits a promise returned
    // from onSuccess before resolving mutateAsync, so a dialog that creates a
    // customer and then hands its id to a form cannot do so while the list it
    // is about to render still describes the world before that row existed.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: invoiceCustomerKeys.all }),
  });
}

export function useUpdateInvoiceCustomer() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new InvoiceCustomersService(supabase);

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: InvoiceCustomerInput }) =>
      service.updateInvoiceCustomer(id, input),
    onSuccess: () =>
      Promise.all([
        // `all` rather than the one detail key: the list renders the edited
        // name and the picker renders it again, and neither is something this
        // mutation can know is mounted.
        queryClient.invalidateQueries({ queryKey: invoiceCustomerKeys.all }),
        // The invoicing document embeds the WHOLE customer row against every
        // club billed to it, so an edited address is stale in every month
        // already fetched — and a month is what a file is built from.
        queryClient.invalidateQueries({
          queryKey: municipalityInvoicingKeys.all,
        }),
      ]),
  });
}
