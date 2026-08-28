"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { adminDashboardKeys } from "@/services/admin-dashboard/admin-dashboard.keys";
import {
  GeduProfilesService,
  type GeduCertification,
  type GeduCertificationDetail,
} from "./gedu-profiles.service";

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
  options?: { initialData?: GeduCertificationDetail | null },
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

/**
 * Certify — or de-certify — one educator.
 *
 * **The invalidation is returned, not fired and forgotten.** React Query awaits
 * whatever `onSuccess` returns before it settles `mutateAsync`, so returning the
 * promise is what makes "the write landed" mean "and every surface reading it
 * has been refetched". Dropped, `mutateAsync` resolves while the card still
 * holds the pre-write row, and the button re-enables showing the old verdict —
 * long enough for a second click to toggle it straight back.
 *
 * The admin dashboard's key is invalidated by the dashboard shell rather than
 * here, because that is where the certify action's *other* effect lives: the
 * row leaving the queue and the strip's certified count are one fact the shell
 * already owns.
 */
export function useSetGeduCertified() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GeduProfilesService(supabase);

  return useMutation({
    mutationFn: ({ geduId, certified }: { geduId: string; certified: boolean }) =>
      service.setCertified(geduId, certified),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: geduProfileKeys.all }),
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
 * **And the admin dashboard's key alongside it.** Recording a check moves
 * nobody in or out of the certification queue — it is a list of *uncertified*
 * educators and this write does not certify anybody — but the queue renders the
 * fact itself: each row carries a standing chip for the check, and whether the
 * certify button raises the missing-prerequisite confirmation is decided by the
 * same stamp. Left stale, a dashboard open in another tab goes on warning about
 * an extract the admin has just recorded. That entry only ever exists in an
 * admin's own browser, and this is an admin's write, so it is always there to
 * invalidate.
 *
 * **Both invalidations are returned rather than fired and forgotten**, so
 * `mutateAsync` settles only once the refetches have landed. Dropped, the
 * checkbox re-enables still showing the pre-write value, and a second click
 * would re-stamp `criminal_record_check_at` at a new moment.
 *
 * The caller still owns the disabled state across the success path: React
 * Query's `isPending` flips false before `onSuccess` runs, so a control must
 * hold its own committing flag set synchronously before `mutate()`.
 */
export function useSetGeduCriminalRecordCheck() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GeduProfilesService(supabase);

  return useMutation({
    mutationFn: ({ geduId, passed }: { geduId: string; passed: boolean }) =>
      service.setCriminalRecordCheck(geduId, passed),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: geduProfileKeys.all }),
        queryClient.invalidateQueries({ queryKey: adminDashboardKeys.all }),
      ]),
  });
}
