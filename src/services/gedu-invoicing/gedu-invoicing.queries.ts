"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { geduInvoicingKeys } from "./gedu-invoicing.keys";
import type { GeduInvoicingSnapshot } from "./gedu-invoicing.contracts";
import { GeduInvoicingService } from "./gedu-invoicing.service";

/**
 * One month of every gedu's invoicing, **seeded from the server render** — the
 * same arrangement as the municipality invoicing page: the route awaits the
 * document, hydrates it into this key through its `HydrationBoundary`, and the
 * required `initialData` makes `data` non-optional so the page has no loading
 * branch.
 */
export function useAdminGeduInvoicingMonth(
  monthStart: string,
  initialData: GeduInvoicingSnapshot,
) {
  const supabase = getClient();
  const service = new GeduInvoicingService(supabase);

  return useQuery({
    queryKey: geduInvoicingKeys.adminMonth(monthStart),
    queryFn: () => service.getAdminMonth(monthStart),
    initialData,
  });
}

/** The signed-in gedu's own month, seeded from the server render the same way. */
export function useMyGeduInvoicingMonth(
  monthStart: string,
  initialData: GeduInvoicingSnapshot,
) {
  const supabase = getClient();
  const service = new GeduInvoicingService(supabase);

  return useQuery({
    queryKey: geduInvoicingKeys.myMonth(monthStart),
    queryFn: () => service.getMyMonth(monthStart),
    initialData,
  });
}
