"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { GeduQualification } from "@/types";
import {
  GeduQualificationsService,
  type HeldGeduQualification,
} from "./gedu-qualifications.service";

/**
 * A root of its own rather than a branch of the gedu-profiles key:
 * qualifications live in their own table, so a certify refetching them, or a
 * qualification toggle refetching certification, would describe a
 * relationship the data does not have.
 */
export const geduQualificationKeys = {
  all: ["gedu-qualifications"] as const,
  byGedu: (geduId: string) =>
    [...geduQualificationKeys.all, "by-gedu", geduId] as const,
};

/** The qualifications one gedu holds. Seed `initialData` from a server fetch. */
export function useGeduQualifications(
  geduId: string,
  options?: { initialData?: HeldGeduQualification[] },
) {
  const supabase = getClient();
  const service = new GeduQualificationsService(supabase);

  return useQuery({
    queryKey: geduQualificationKeys.byGedu(geduId),
    queryFn: () => service.getForGedu(geduId),
    initialData: options?.initialData,
  });
}

/**
 * Grant or revoke one qualification for one gedu.
 *
 * **The invalidation is returned, not fired and forgotten**, so `mutateAsync`
 * settles only once the gedu's qualifications have been refetched — dropped, a
 * toggle re-enables still showing the value it just replaced.
 */
export function useSetGeduQualification() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GeduQualificationsService(supabase);

  return useMutation({
    mutationFn: ({
      geduId,
      qualification,
      held,
    }: {
      geduId: string;
      qualification: GeduQualification;
      held: boolean;
    }) => service.setQualification(geduId, qualification, held),
    onSuccess: (_data, { geduId }) =>
      queryClient.invalidateQueries({
        queryKey: geduQualificationKeys.byGedu(geduId),
      }),
  });
}
