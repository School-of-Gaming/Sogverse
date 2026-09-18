"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { adminDashboardKeys } from "@/services/admin-dashboard/admin-dashboard.keys";
import { userKeys } from "@/services/users";
import {
  GeduProfilesService,
  type GeduCertificationDetail,
} from "./gedu-profiles.service";

export const geduProfileKeys = {
  all: ["gedu-profiles"] as const,
  detail: (id: string) => [...geduProfileKeys.all, "detail", id] as const,
};

/**
 * Certification state for a single gedu. Seed `initialData` from a server fetch.
 *
 * **There is deliberately no every-gedu read beside this one.** The two flags a
 * *list* renders — certified, and whether a criminal record extract has been
 * recorded — are columns of the admin people-list view, so they arrive with the
 * row they are about; a second whole-table read existed only to feed those
 * lists, and its truncation printed a wrong mark on every educator past the
 * cap. This read is for the one surface that needs the whole row: the
 * user-detail card, which also names the acting admins.
 */
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
 *
 * **The people lists are invalidated too, because `certified` is a column of
 * their rows.** It rides along on the admin list read rather than arriving from
 * a certification read of its own, which is what deleted a whole-table read —
 * and the price of that is exactly this line: the surfaces reading the flag are
 * no longer reachable through this root, so a certify that did not invalidate
 * theirs would leave the users list unmarked and the gedu picker refusing to
 * offer an educator the admin has just approved.
 */
export function useSetGeduCertified() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GeduProfilesService(supabase);

  return useMutation({
    mutationFn: ({ geduId, certified }: { geduId: string; certified: boolean }) =>
      service.setCertified(geduId, certified),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: geduProfileKeys.all }),
        queryClient.invalidateQueries({ queryKey: userKeys.lists() }),
      ]),
  });
}

/**
 * Record — or withdraw — an admin's statement that they have seen an acceptable
 * criminal record extract for one educator.
 *
 * Invalidates the whole `gedu-profiles` root, exactly as certification does and
 * for the same reason: the flag lives on the same row, so the detail card is
 * reading the value this call just changed. **And the people lists, because the
 * users list renders this flag off its own row** — the same reason certification
 * invalidates them, and the same failure without it: a warning mark still
 * claiming no extract has been seen, minutes after an admin recorded one.
 *
 * **And the admin dashboard's key alongside it.** Recording a check moves
 * nobody in or out of the certification queue — it is a list of *uncertified*
 * educators and this write does not certify anybody — but the queue renders the
 * fact itself: each row carries a standing chip for the check, and whether the
 * certify button raises the missing-prerequisite confirmation is decided by the
 * same stamp. Left stale, the admin who ticks the box on a user page and
 * client-side-navigates back to the dashboard meets a cached snapshot still
 * warning about the extract they just recorded — and a certify click there
 * would assert it as fact. That entry only ever exists in an admin's own
 * browser, and this is an admin's write, so it is always there to invalidate.
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
        queryClient.invalidateQueries({ queryKey: userKeys.lists() }),
      ]),
  });
}
