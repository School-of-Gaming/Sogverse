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
  /**
   * Whether the read has answered at all — either way. A caller that renders a
   * *block* of marks atomically needs this: an entry that is absent because the
   * read is still in flight and one that is absent because the educator has no
   * row are the same `undefined` from the map, and only this tells them apart.
   */
  isPending: boolean;
}

export function useGeduCertificationMap(): GeduCertificationLookup {
  const { data, isError, isPending } = useGeduProfiles();
  const map = useMemo(
    () => new Map((data ?? []).map((g) => [g.user_id, g])),
    [data],
  );
  return useMemo(
    () => ({ map, isError, isPending }),
    [map, isError, isPending],
  );
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

/**
 * Record — or withdraw — an admin's statement that they have seen an acceptable
 * criminal record extract for one educator.
 *
 * Invalidates the whole `gedu-profiles` root, exactly as certification does and
 * for the same reason: the flag lives on the same row, so the detail card, the
 * users list and the picker are all reading the value this call just changed.
 *
 * **The admin dashboard's key is deliberately not invalidated here.** Its cache
 * entry only ever exists in an admin's browser, so it *could* be — but the
 * certification queue is a list of *uncertified* educators, and recording a
 * check neither adds anybody to it nor takes anybody out; the queue's own copy
 * of the stamp refreshes on its next read. The certify action invalidates that
 * key because it is the one write that moves a row out of the list.
 *
 * The caller owns the disabled state across the success path: React Query's
 * `isPending` flips false before `onSuccess` runs, so a control must hold its
 * own committing flag set synchronously before `mutate()`.
 */
export function useSetGeduCriminalRecordCheck() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GeduProfilesService(supabase);

  return useMutation({
    mutationFn: ({ geduId, passed }: { geduId: string; passed: boolean }) =>
      service.setCriminalRecordCheck(geduId, passed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: geduProfileKeys.all });
    },
  });
}
