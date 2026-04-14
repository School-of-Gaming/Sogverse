"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GeduLocationsService } from "./gedu-locations.service";

export const geduLocationKeys = {
  all: ["gedu-locations"] as const,
  lists: () => [...geduLocationKeys.all, "list"] as const,
  forGedu: (geduId: string) => [...geduLocationKeys.lists(), geduId] as const,
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
    // Invalidate the whole namespace so any future "who covers X?" query
    // cached under geduLocationKeys.all also refetches.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: geduLocationKeys.all }),
  });
}
