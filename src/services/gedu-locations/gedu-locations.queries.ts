"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GeduLocationsService } from "./gedu-locations.service";
import { sessionSubstitutionKeys } from "@/services/session-substitution/session-substitution.keys";

export const geduLocationKeys = {
  all: ["gedu-locations"] as const,
  lists: () => [...geduLocationKeys.all, "list"] as const,
  forGedu: (geduId: string) => [...geduLocationKeys.lists(), geduId] as const,
  coveringProduct: (productId: string) =>
    [...geduLocationKeys.all, "covering-product", productId] as const,
};

export function useGeduLocations(geduId: string | null | undefined) {
  const supabase = getClient();
  const service = new GeduLocationsService(supabase);

  return useQuery({
    queryKey: geduLocationKeys.forGedu(geduId ?? ""),
    queryFn: () => service.getForGedu(geduId!),
    enabled: !!geduId,
  });
}

/**
 * The set of gedus whose coverage areas reach an in-person product's site, for
 * the admin gedu picker's coverage warning. Never asked while `productId` is
 * null, which is how a caller with no site to ask about opts out.
 */
export function useGedusCoveringProduct(productId: string | null) {
  const supabase = getClient();
  const service = new GeduLocationsService(supabase);

  return useQuery({
    queryKey: geduLocationKeys.coveringProduct(productId ?? ""),
    queryFn: async () =>
      new Set(await service.getGeduIdsCoveringProduct(productId!)),
    enabled: productId !== null,
  });
}

export function useSetGeduLocations() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GeduLocationsService(supabase);

  return useMutation({
    mutationFn: ({ geduId, locationIds }: { geduId: string; locationIds: string[] }) =>
      service.setForGedu(geduId, locationIds),
    // Return the invalidate promise so mutateAsync (and isPending) wait for
    // the refetch to complete. Without this the button's in-flight state ends
    // the moment the mutation resolves, before the cache has the new data,
    // causing a one-frame flash where the button re-enables with stale state.
    // Invalidate the whole namespace so the picker's "who covers this
    // product?" answer, cached under geduLocationKeys.all, also refetches.
    // The gedu's substitution pool filters on their coverage areas, so it is
    // invalidated too.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: geduLocationKeys.all }),
        queryClient.invalidateQueries({ queryKey: sessionSubstitutionKeys.all }),
      ]),
  });
}
