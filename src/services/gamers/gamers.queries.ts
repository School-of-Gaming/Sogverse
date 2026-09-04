"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import {
  GamerService,
  type GamerProfileEdit,
  type GamerUpdate,
} from "./gamers.service";
import { minecraftKeys } from "@/services/minecraft/minecraft.queries";
import { robloxKeys } from "@/services/roblox/roblox.queries";
import { familyKeys } from "@/services/family";
import type { CreateGamerInput, GamerProfile } from "@/types";

export const gamerKeys = {
  all: ["gamers"] as const,
  myGamers: () => [...gamerKeys.all, "my-gamers"] as const,
  myParents: () => [...gamerKeys.all, "my-parents"] as const,
  linkedGamers: (parentId: string) =>
    [...gamerKeys.all, "linked", parentId] as const,
  linkedParents: (gamerId: string) =>
    [...gamerKeys.all, "linked-parents", gamerId] as const,
  links: (parentId: string) => [...gamerKeys.all, "links", parentId] as const,
  gamerProfile: (gamerId: string) =>
    [...gamerKeys.all, "gamer-profile", gamerId] as const,
  // Keyed on the ids asked about, sorted so the same set in a different order
  // is the same cache entry rather than a second fetch of identical rows.
  signIns: (userIds: readonly string[]) =>
    [...gamerKeys.all, "sign-ins", [...userIds].sort().join(",")] as const,
};

// Defaults to enabled so dashboard call sites (which are already gated to
// signed-in customers by the proxy) can call it with no argument. Public
// surfaces must pass `enabled: isCustomer` — the underlying RPC is
// granted only to `authenticated`, so calling it logged-out throws a 401.
export function useMyGamers({ enabled = true }: { enabled?: boolean } = {}) {
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useQuery({
    queryKey: gamerKeys.myGamers(),
    queryFn: () => service.getMyGamers(),
    enabled,
  });
}

export function useMyParents() {
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useQuery({
    queryKey: gamerKeys.myParents(),
    queryFn: () => service.getMyParents(),
  });
}

export function useLinkedGamers(parentId: string) {
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useQuery({
    queryKey: gamerKeys.linkedGamers(parentId),
    queryFn: () => service.getLinkedGamers(parentId),
    enabled: !!parentId,
  });
}

export function useLinkedParents(gamerId: string) {
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useQuery({
    queryKey: gamerKeys.linkedParents(gamerId),
    queryFn: () => service.getLinkedParents(gamerId),
    enabled: !!gamerId,
  });
}

export function useCreateGamer() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useMutation({
    mutationFn: ({
      parentId,
      input,
    }: {
      parentId: string;
      input: CreateGamerInput;
    }) => service.createGamerAccount(parentId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gamerKeys.myGamers() });
      queryClient.invalidateQueries({ queryKey: familyKeys.list() });
    },
  });
}

export function useUpdateGamer() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useMutation({
    mutationFn: ({
      gamerId,
      updates,
    }: {
      gamerId: string;
      updates: GamerUpdate;
    }) => service.updateGamer(gamerId, updates),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: gamerKeys.myGamers() });
      queryClient.invalidateQueries({
        queryKey: gamerKeys.gamerProfile(variables.gamerId),
      });
      queryClient.invalidateQueries({ queryKey: minecraftKeys.all });
      // The stored rows only — never the Roblox root, which would drag every
      // mounted avatar lookup into a refetch against a per-IP rate limit.
      queryClient.invalidateQueries({ queryKey: robloxKeys.accounts() });
      // The family list carries each child's sign-in mode, and an edit here is
      // one of the two things that can change it (the other is creation, which
      // already invalidates this key). The switcher reads that mode to decide
      // whether a sibling is reachable at all, so a stale one is a tile that
      // offers a credential the account no longer has.
      queryClient.invalidateQueries({ queryKey: familyKeys.list() });
    },
  });
}

/**
 * Re-send the verification mail to a child who signs in with a real address.
 *
 * No cache to invalidate — nothing about the parent's view changes until the
 * child clicks the link — so this exists as a hook purely so the button gets the
 * same pending/error handling every other write on the page has.
 */
export function useSendGamerVerificationEmail() {
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useMutation({
    mutationFn: (gamerId: string) =>
      service.sendGamerVerificationEmail(gamerId),
  });
}

/**
 * The sign-in mode of each named user, keyed by id, for a surface rendering
 * many children at once.
 *
 * **It asks about the ids the caller is holding, and only those.** The surface
 * that needs this has already read the users it is about to paint, so the read
 * is bounded by the page rather than by the size of `gamer_profiles`; ids that
 * turn out not to be gamers are simply absent from the map. Passing ids the
 * page does not render would be an unbounded read wearing a keyed shape.
 *
 * A `Map` rather than the rows, because every caller looks a child up by id;
 * memoised so a re-render does not hand a new identity to whatever renders from
 * it. `isPending` is exposed because the admin list holds its skeleton until
 * this has answered — the identity line under a child's name is decided by the
 * mode, so a mode arriving late would insert a line between rows already
 * painted.
 *
 * **`userIds` is optional only so a caller can say "not yet".** Absent is the
 * pre-ids state — the list of users has not resolved — and it answers with an
 * empty map and no fetch, which a caller must render as *nothing known yet*
 * rather than as *no gamers here*. An empty array means the same thing and
 * costs the same nothing.
 *
 * Read under the caller's own RLS: an admin gets every child they ask about, a
 * parent gets theirs. Keyed under the gamer root, so the create and edit writes
 * that already invalidate `gamerKeys.all` refresh it for free.
 */
export function useGamerSignIns(userIds?: readonly string[]) {
  const supabase = getClient();
  const service = new GamerService(supabase);

  const ids = useMemo(() => userIds ?? [], [userIds]);

  const { data, isPending, isError } = useQuery({
    queryKey: gamerKeys.signIns(ids),
    queryFn: () => service.getGamerSignIns(ids),
    enabled: ids.length > 0,
  });

  const map = useMemo(
    () => new Map((data ?? []).map((row) => [row.user_id, row.sign_in])),
    [data],
  );

  // A disabled query stays `pending` forever, which would hold a caller's
  // skeleton up on a page that has nothing to ask about. Nothing is in flight,
  // so nothing is pending.
  const pending = ids.length > 0 && isPending;

  return useMemo(
    () => ({ map, isPending: pending, isError }),
    [map, pending, isError],
  );
}

/**
 * `initialData` is for a server component that has already read the row and is
 * handing it down: the island paints complete on its first frame with nothing
 * arriving late enough to move anything.
 */
export function useGamerProfile(
  gamerId: string,
  { initialData }: { initialData?: GamerProfile } = {},
) {
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useQuery({
    queryKey: gamerKeys.gamerProfile(gamerId),
    queryFn: () => service.getGamerProfile(gamerId),
    enabled: !!gamerId,
    initialData,
  });
}

/**
 * An admin correcting the birth date / gender on a gamer's profile row.
 *
 * The write returns the stored row, so the cache is *set* from it before being
 * invalidated: the card reads its values back from this key, and seeding it
 * means the saved state is on screen in the same tick the save resolves rather
 * than a refetch later. The invalidate that follows is what keeps any other
 * mounted reader of the same key honest.
 *
 * Scope stops at the profile key on purpose. Age also appears on the group and
 * roster surfaces, but those read it through their own RPC-backed keys on pages
 * this admin is not looking at; dragging them into a refetch from here would
 * cost every one of those queries for a value nobody is reading.
 */
export function useUpdateGamerProfile() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useMutation({
    mutationFn: ({
      gamerId,
      edit,
    }: {
      gamerId: string;
      edit: GamerProfileEdit;
    }) => service.updateGamerProfile(gamerId, edit),
    onSuccess: (profile, variables) => {
      queryClient.setQueryData(
        gamerKeys.gamerProfile(variables.gamerId),
        profile,
      );
      queryClient.invalidateQueries({
        queryKey: gamerKeys.gamerProfile(variables.gamerId),
      });
    },
  });
}

