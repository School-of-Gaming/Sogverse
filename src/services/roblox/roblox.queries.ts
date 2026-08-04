"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { RobloxService } from "./roblox.service";
import type { RobloxProfileResponse } from "./roblox.contracts";

/**
 * Two branches under one root, and the split is load-bearing.
 *
 * `accounts` holds what we have **stored** — rows out of `roblox_accounts`,
 * cheap indexed reads by primary key. `profiles` holds what Roblox **told us** —
 * a lookup that costs three upstream calls against a budget of sixty a minute
 * shared by every IP the serverless fleet has.
 *
 * A save invalidates `accounts` and never the root, precisely because the root
 * would drag every mounted lookup into a refetch and spend that budget to
 * re-learn an answer nothing changed. Lookups are keyed by the **lowercased**
 * username: the Roblox lookup is case-insensitive, so `Builderman` and
 * `builderman` are the same account and must not occupy two cache entries.
 */
export const robloxKeys = {
  all: ["roblox"] as const,
  profiles: () => [...robloxKeys.all, "profile"] as const,
  profile: (username: string) =>
    [...robloxKeys.profiles(), username.toLowerCase()] as const,
  accounts: () => [...robloxKeys.all, "account"] as const,
  myAccount: () => [...robloxKeys.accounts(), "me"] as const,
  account: (userId: string) => [...robloxKeys.accounts(), userId] as const,
};

/**
 * The caller's own saved handle. A keyed read of one row by primary key — it
 * lands in a frame or two, so there is no loading affordance to design.
 */
export function useMyRobloxAccount() {
  const supabase = getClient();
  const service = new RobloxService(supabase);

  return useQuery({
    queryKey: robloxKeys.myAccount(),
    queryFn: () => service.getMyRobloxAccount(),
  });
}

/** Somebody else's saved handle — a parent reading their own child's row. */
export function useRobloxAccount(userId: string) {
  const supabase = getClient();
  const service = new RobloxService(supabase);

  return useQuery({
    queryKey: robloxKeys.account(userId),
    queryFn: () => service.getRobloxAccount(userId),
    enabled: !!userId,
  });
}

/**
 * Pull: resolve a username we already hold — a saved handle whose avatar a
 * surface wants to draw without anyone pressing a button. Two external hops
 * behind one route, so it is a real network call, not a cached read.
 */
export function useRobloxProfile(username: string | null) {
  const supabase = getClient();
  const service = new RobloxService(supabase);

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
  const supabase = getClient();
  const service = new RobloxService(supabase);

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

/**
 * Save the caller's own handle, or clear it with `null`.
 *
 * Invalidates the stored-account branch and nothing else — the row really did
 * change, and the lookup branch did not.
 */
export function useUpdateMyRoblox() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new RobloxService(supabase);

  return useMutation({
    mutationFn: (robloxUsername: string | null) =>
      service.updateMyRoblox(robloxUsername),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: robloxKeys.accounts() });
    },
  });
}
