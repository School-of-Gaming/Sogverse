"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { robloxRenderUrl } from "@/lib/roblox";
import type { GameFigure } from "@/lib/constants/game-platforms";
import type { RobloxAccount } from "@/types";
import { RobloxService } from "./roblox.service";
import type { RobloxProfileResponse } from "./roblox.contracts";

/**
 * Three branches under one root, and the split is load-bearing.
 *
 * `accounts` holds what we have **stored** — rows out of `roblox_accounts`,
 * cheap indexed reads by primary key. `profiles` holds a **name** resolved at
 * capture time, three upstream calls deep. `renders` holds the pictures for an
 * **id** we already stored, which is the cheap two-call path and the one every
 * page load uses.
 *
 * A save invalidates `accounts` and never the root, precisely because the root
 * would drag every mounted lookup into a refetch and spend a budget of sixty
 * requests a minute — shared by every IP the serverless fleet has — to re-learn
 * answers nothing changed. Lookups are keyed by the **lowercased** username: the
 * Roblox lookup is case-insensitive, so `Builderman` and `builderman` are the
 * same account and must not occupy two cache entries. Renders are keyed by the
 * numeric id, which has no such ambiguity.
 */
export const robloxKeys = {
  all: ["roblox"] as const,
  profiles: () => [...robloxKeys.all, "profile"] as const,
  profile: (username: string) =>
    [...robloxKeys.profiles(), username.toLowerCase()] as const,
  accounts: () => [...robloxKeys.all, "account"] as const,
  myAccount: () => [...robloxKeys.accounts(), "me"] as const,
  account: (userId: string) => [...robloxKeys.accounts(), userId] as const,
  renders: () => [...robloxKeys.all, "render"] as const,
  // Keyed by figure as well as id: a cache entry holds the figure that was
  // asked for and nothing else, so a surface drawing a headshot must not read
  // an entry resolved for the full figure and find a null it would misread as
  // "no picture".
  render: (robloxUserId: number, figure: GameFigure) =>
    [...robloxKeys.renders(), robloxUserId, figure] as const,
};

/**
 * A render URL stays good for as long as anyone is looking at the page.
 *
 * The JSON naming it is `no-cache` upstream, but the URL it hands back addresses
 * an immutable image — it only changes when the person redesigns their avatar,
 * which is not something a page open in another tab needs to notice. So this is
 * resolved once per id per session and never re-fetched, which is the difference
 * between one request and one per remount on a page an admin clicks through.
 */
const RENDER_STALE_TIME = Infinity;

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

/**
 * Somebody else's saved handle — a parent reading their own child's row, or an
 * admin reading anyone's. Seed `initialData` from a server fetch where the page
 * already has the row, so it paints complete on the first frame.
 */
export function useRobloxAccount(
  userId: string,
  options?: { initialData?: RobloxAccount | null },
) {
  const supabase = getClient();
  const service = new RobloxService(supabase);

  return useQuery({
    queryKey: robloxKeys.account(userId),
    queryFn: () => service.getRobloxAccount(userId),
    enabled: !!userId,
    initialData: options?.initialData,
  });
}

/**
 * The renders for one **stored, verified** account, drawn on page load.
 *
 * Takes the numeric id rather than the handle, and that is the whole design: an
 * account we saved carries the id, so the name→id hop is not just avoidable but
 * meaningless — the id is the fact and the name is only its label. `null`
 * disables the query, which is what an *unverified* row passes, because a handle
 * nobody confirmed has no id and resolving the name instead could draw whichever
 * stranger happens to own it. The silhouette is the correct picture there.
 *
 * **Never retried.** A picture is decoration; a failed fetch degrades to the
 * silhouette and the person still sees the name and the tick. Retrying would
 * spend three more requests against the exact per-IP bucket this path exists to
 * conserve, to redraw something nobody is waiting on.
 *
 * **Singular on purpose, and a list must not map it over rows.** The upstream
 * cost is per request, not per id, so N rows calling this is N requests against
 * that bucket — the failure mode the batch route was built to avoid. A roster
 * collects its ids and asks the service for all of them at once.
 */
export function useRobloxRender(
  robloxUserId: number | null,
  figure: GameFigure = "full",
) {
  const supabase = getClient();
  const service = new RobloxService(supabase);

  // The URL for the figure asked for, not the whole set: the other field would
  // be `null` because it was never requested, and a call site reading it would
  // take that for "Roblox has no picture".
  return useQuery<string | null>({
    queryKey: robloxKeys.render(robloxUserId ?? 0, figure),
    queryFn: async () => {
      if (robloxUserId === null) return null;
      const renders = await service.resolveRenders([robloxUserId], [figure]);
      const resolved = renders[String(robloxUserId)];
      return resolved === undefined ? null : robloxRenderUrl(resolved, figure);
    },
    enabled: robloxUserId !== null,
    staleTime: RENDER_STALE_TIME,
    retry: false,
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
