"use client";

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
    },
  });
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

