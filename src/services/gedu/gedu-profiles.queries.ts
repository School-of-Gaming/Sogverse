"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GeduProfilesService, type GeduCertification } from "./gedu-profiles.service";

export const geduProfileKeys = {
  all: ["gedu-profiles"] as const,
  lists: () => [...geduProfileKeys.all, "list"] as const,
  detail: (id: string) => [...geduProfileKeys.all, "detail", id] as const,
};

/** Certification state for every gedu. Admin-only (RLS). */
export function useGeduProfiles() {
  const supabase = getClient();
  const service = new GeduProfilesService(supabase);

  return useQuery({
    queryKey: geduProfileKeys.lists(),
    queryFn: () => service.getAll(),
  });
}

/** Certification state for a single gedu. Seed `initialData` from a server fetch. */
export function useGeduProfile(
  geduId: string,
  options?: { initialData?: GeduCertification | null },
) {
  const supabase = getClient();
  const service = new GeduProfilesService(supabase);

  return useQuery({
    queryKey: geduProfileKeys.detail(geduId),
    queryFn: () => service.getOne(geduId),
    initialData: options?.initialData,
  });
}

/**
 * The same data keyed by gedu id for O(1) lookup in lists and pickers.
 *
 * `isError` travels with the map because an absent entry is ambiguous on its
 * own: it means "this gedu is not certified" only when the read succeeded, and
 * "we do not know" when it failed. Callers that *assert* a state to the reader
 * (a badge) must say nothing while `isError`; callers that *gate* an action can
 * keep failing closed, which is the safe direction for a gate and the wrong one
 * for a claim.
 */
export interface GeduCertificationLookup {
  map: Map<string, GeduCertification>;
  isError: boolean;
}

export function useGeduCertificationMap(): GeduCertificationLookup {
  const { data, isError } = useGeduProfiles();
  const map = useMemo(
    () => new Map((data ?? []).map((g) => [g.user_id, g])),
    [data],
  );
  return useMemo(() => ({ map, isError }), [map, isError]);
}

export function useSetGeduCertified() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GeduProfilesService(supabase);

  return useMutation({
    mutationFn: ({ geduId, certified }: { geduId: string; certified: boolean }) =>
      service.setCertified(geduId, certified),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: geduProfileKeys.all });
    },
  });
}
