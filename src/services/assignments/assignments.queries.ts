"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { assignmentKeys } from "./assignments.keys";
import {
  AssignmentsService,
  type MyAssignedProductSessionRow,
} from "./assignments.service";

/**
 * The signed-in gedu's assignment rows — one per (product, their group in it),
 * with the product shell, its schedule slots and the product-wide aggregates.
 *
 * It returns **rows, not occurrences**. The dashboard rolls each row up to one
 * card and derives only that assignment's *next* session; the full expansion of
 * a schedule now belongs to one surface, the group workspace's feed, and
 * enumerating it here as well is what used to give a gedu with two weekly clubs
 * a screen of sixteen near-identical rows.
 *
 * `initialData` is required — the gedu page server-prefetches the rows so the
 * dashboard paints on first frame with no loading state at all.
 */
export function useMyAssignedProducts(options: {
  initialData: MyAssignedProductSessionRow[];
}) {
  const supabase = getClient();
  const service = new AssignmentsService(supabase);

  return useQuery({
    queryKey: assignmentKeys.myAssignedProducts(),
    queryFn: () => service.getMyAssignedProducts(),
    initialData: options.initialData,
  });
}

/**
 * Drives the gedu's session-details page (product-scoped data behind a
 * session-card entry point). Backed by the SECURITY DEFINER RPC
 * `get_gedu_assigned_product` — the function gates access on
 * (role = 'gedu' AND assigned to the product), so the user-bound client
 * is enough. Returns `null` from the service on 42501 so consumers can
 * render a "not your session" empty state instead of throwing.
 *
 * The workspace route runs this same read server-side and hydrates the answer
 * under this key, so a direct load resolves on the first render with no fetch.
 * There is no `initialData` parameter for that reason — the seeding reaches
 * this hook through the cache rather than through the call site, which is what
 * lets the route also seed the *second*, group-keyed read it unlocks.
 */
export function useGeduAssignedProduct(productId: string | undefined) {
  const supabase = getClient();
  const service = new AssignmentsService(supabase);

  return useQuery({
    queryKey: assignmentKeys.assignedProductDetail(productId),
    queryFn: () => service.getAssignedProductDetail(productId!),
    enabled: !!productId,
  });
}
