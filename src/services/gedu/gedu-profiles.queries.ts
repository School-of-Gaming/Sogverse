"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GeduProfilesService, type GeduVerification } from "./gedu-profiles.service";

export const geduProfileKeys = {
  all: ["gedu-profiles"] as const,
  lists: () => [...geduProfileKeys.all, "list"] as const,
  detail: (id: string) => [...geduProfileKeys.all, "detail", id] as const,
};

/** Verification state for every gedu. Admin-only (RLS). */
export function useGeduProfiles() {
  const supabase = getClient();
  const service = new GeduProfilesService(supabase);

  return useQuery({
    queryKey: geduProfileKeys.lists(),
    queryFn: () => service.getAll(),
  });
}

/** Verification state for a single gedu. Seed `initialData` from a server fetch. */
export function useGeduProfile(
  geduId: string,
  options?: { initialData?: GeduVerification | null },
) {
  const supabase = getClient();
  const service = new GeduProfilesService(supabase);

  return useQuery({
    queryKey: geduProfileKeys.detail(geduId),
    queryFn: () => service.getOne(geduId),
    initialData: options?.initialData,
  });
}

/** Convenience: the same data keyed by gedu id for O(1) lookup in lists/pickers. */
export function useGeduVerificationMap(): Map<string, GeduVerification> {
  const { data } = useGeduProfiles();
  return useMemo(() => new Map((data ?? []).map((g) => [g.user_id, g])), [data]);
}

export function useSetGeduVerified() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GeduProfilesService(supabase);

  return useMutation({
    mutationFn: ({ geduId, verified }: { geduId: string; verified: boolean }) =>
      service.setVerified(geduId, verified),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: geduProfileKeys.all });
    },
  });
}
