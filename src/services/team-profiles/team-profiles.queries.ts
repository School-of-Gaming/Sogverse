"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { TeamProfilesService } from "./team-profiles.service";
import {
  isTeamProfileNotReadyError,
  type TeamProfileRecord,
  type TeamProfileSaveInput,
} from "./team-profiles.types";

export const teamProfileKeys = {
  all: ["team-profiles"] as const,
  detail: (userId: string) => [...teamProfileKeys.all, "detail", userId] as const,
};

/**
 * One person's saved team profile: the caller's own, or anyone's for an
 * admin. Seed `initialData` from the server read, which is the same service
 * call on the request's own client.
 */
export function useTeamProfile(
  userId: string,
  options?: { initialData?: TeamProfileRecord | null },
) {
  const service = new TeamProfilesService(getClient());

  return useQuery({
    queryKey: teamProfileKeys.detail(userId),
    queryFn: () => service.getTeamProfile(userId),
    initialData: options?.initialData,
  });
}

/**
 * Save a profile and its checkbox — the caller's own, or any admin's or
 * Gedu's for an admin — storing a newly cropped photo first. Resolves to the
 * saved photo's path. The invalidation is returned so `mutateAsync` settles
 * only once the saved profile is re-read.
 */
export function useSaveTeamProfile() {
  const queryClient = useQueryClient();
  const service = new TeamProfilesService(getClient());

  return useMutation({
    mutationFn: ({
      userId,
      input,
      on,
    }: {
      userId: string;
      input: TeamProfileSaveInput;
      on: boolean;
    }) => service.saveTeamProfile(userId, input, on),
    onSuccess: (_data, { userId }) =>
      queryClient.invalidateQueries({ queryKey: teamProfileKeys.detail(userId) }),
  });
}

/**
 * An admin approves a Gedu's profile, or takes the approval back. A refusal
 * for a profile no longer marked ready re-reads it too: the page's read was
 * stale, and the re-read is what disables Approve.
 */
export function useSetGeduTeamProfileApproval() {
  const queryClient = useQueryClient();
  const service = new TeamProfilesService(getClient());

  return useMutation({
    mutationFn: ({ geduId, approved }: { geduId: string; approved: boolean }) =>
      service.setGeduTeamProfileApproval(geduId, approved),
    onSuccess: (_data, { geduId }) =>
      queryClient.invalidateQueries({ queryKey: teamProfileKeys.detail(geduId) }),
    onError: (error, { geduId }) =>
      isTeamProfileNotReadyError(error)
        ? queryClient.invalidateQueries({ queryKey: teamProfileKeys.detail(geduId) })
        : undefined,
  });
}
