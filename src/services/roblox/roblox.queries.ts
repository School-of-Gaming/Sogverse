"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RobloxService } from "./roblox.service";
import type { RobloxProfileResponse } from "./roblox.contracts";

/**
 * Roblox lookups are keyed by the **lowercased** username: the Roblox lookup is
 * case-insensitive, so `Builderman` and `builderman` are the same account and
 * must not occupy two cache entries.
 */
export const robloxKeys = {
  all: ["roblox"] as const,
  profile: (username: string) =>
    [...robloxKeys.all, "profile", username.toLowerCase()] as const,
};

/**
 * Pull: resolve a username we already hold — a saved handle whose avatar a
 * surface wants to draw without anyone pressing a button. Two external hops
 * behind one route, so it is a real network call, not a cached read.
 */
export function useRobloxProfile(username: string | null) {
  const service = new RobloxService();

  return useQuery({
    queryKey: robloxKeys.profile(username ?? ""),
    queryFn: () => service.verifyRobloxUsername(username ?? ""),
    enabled: !!username,
  });
}

/**
 * Push: verify a username the user has just typed.
 *
 * The success path **seeds** the profile cache rather than invalidating it. The
 * usual rule — a mutation invalidates what it changed — assumes the mutation
 * left a fresher truth on the server that the cache now has to go and re-read.
 * Nothing is written here (the lookup persists nothing), and the response *is*
 * the authoritative answer, so re-fetching it would be a second round trip for
 * a value already in hand.
 */
export function useVerifyRoblox() {
  const queryClient = useQueryClient();
  const service = new RobloxService();

  return useMutation({
    mutationFn: (username: string) => service.verifyRobloxUsername(username),
    onSuccess: (profile: RobloxProfileResponse, username: string) => {
      queryClient.setQueryData(robloxKeys.profile(username), profile);
      // Roblox hands back the canonical casing, which may differ from what was
      // typed. Both spellings normalize to the same key, so this is a no-op
      // unless the canonical name differs by more than case.
      queryClient.setQueryData(robloxKeys.profile(profile.username), profile);
    },
  });
}
