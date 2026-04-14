"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GeduLocationsService } from "./gedu-locations.service";

export const geduLocationKeys = {
  all: ["gedu-locations"] as const,
  forGedu: (geduId: string) => [...geduLocationKeys.all, geduId] as const,
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
    onSuccess: (_, { geduId }) =>
      queryClient.invalidateQueries({ queryKey: geduLocationKeys.forGedu(geduId) }),
  });
}
