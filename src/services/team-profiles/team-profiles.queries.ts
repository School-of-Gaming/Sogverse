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
 * saved photo's path.
 *
 * **The saved profile's cached read is removed, not invalidated.** The one
 * reader, the admin user page's card, is not mounted while the editor is, so
 * an invalidation would re-read nothing, and returning to the page would
 * paint the pre-edit record before the refetch swapped it. A seed passed as
 * `initialData` is ignored while the key holds data; with the key empty, the
 * page's fresh server read is what paints.
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
      queryClient.removeQueries({ queryKey: teamProfileKeys.detail(userId) }),
  });
}

/**
 * An admin makes an admin's or a Gedu's profile public, or hides it. A
 * refusal for a profile no longer marked ready re-reads it too: the page's
 * read was stale, and the re-read is what disables Make public.
 */
export function useSetTeamProfileApproval() {
  const queryClient = useQueryClient();
  const service = new TeamProfilesService(getClient());

  return useMutation({
    mutationFn: ({ userId, approved }: { userId: string; approved: boolean }) =>
      service.setTeamProfileApproval(userId, approved),
    onSuccess: (_data, { userId }) =>
      queryClient.invalidateQueries({ queryKey: teamProfileKeys.detail(userId) }),
    onError: (error, { userId }) =>
      isTeamProfileNotReadyError(error)
        ? queryClient.invalidateQueries({ queryKey: teamProfileKeys.detail(userId) })
        : undefined,
  });
}
