"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { TeamProfilesService } from "./team-profiles.service";
import type {
  GeduTeamProfileDecision,
  TeamProfileRecord,
  TeamProfileSaveInput,
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
 * Save the caller's own profile and their checkbox, storing a newly cropped
 * photo first. Resolves to the saved photo's path. The invalidation is
 * returned so `mutateAsync` settles only once the saved profile is re-read.
 */
export function useSaveOwnTeamProfile() {
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
    }) => service.saveOwnTeamProfile(userId, input, on),
    onSuccess: (_data, { userId }) =>
      queryClient.invalidateQueries({ queryKey: teamProfileKeys.detail(userId) }),
  });
}

/**
 * An admin saves a Gedu's profile content, leaving the Gedu's checkbox alone.
 * Resolves to the saved photo's path.
 */
export function useSaveGeduTeamProfile() {
  const queryClient = useQueryClient();
  const service = new TeamProfilesService(getClient());

  return useMutation({
    mutationFn: ({ geduId, input }: { geduId: string; input: TeamProfileSaveInput }) =>
      service.saveGeduTeamProfile(geduId, input),
    onSuccess: (_data, { geduId }) =>
      queryClient.invalidateQueries({ queryKey: teamProfileKeys.detail(geduId) }),
  });
}

/** An admin approves a Gedu's profile, or withdraws an approved one. */
export function useSetGeduTeamProfileApproval() {
  const queryClient = useQueryClient();
  const service = new TeamProfilesService(getClient());

  return useMutation({
    mutationFn: ({
      geduId,
      approval,
    }: {
      geduId: string;
      approval: GeduTeamProfileDecision;
    }) => service.setGeduTeamProfileApproval(geduId, approval),
    onSuccess: (_data, { geduId }) =>
      queryClient.invalidateQueries({ queryKey: teamProfileKeys.detail(geduId) }),
  });
}
