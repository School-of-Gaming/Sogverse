"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GamerService } from "./gamers.service";
import { groupKeys } from "@/services/groups/groups.queries";
import { minecraftKeys } from "@/services/minecraft/minecraft.queries";
import type { CreateGamerInput } from "@/types";

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
      updates: { firstName?: string; password?: string; minecraftUsername?: string | null };
    }) => service.updateGamer(gamerId, updates),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: gamerKeys.myGamers() });
      queryClient.invalidateQueries({
        queryKey: groupKeys.mine(),
      });
      queryClient.invalidateQueries({
        queryKey: gamerKeys.gamerProfile(variables.gamerId),
      });
      queryClient.invalidateQueries({ queryKey: minecraftKeys.all });
    },
  });
}

export function useGamerProfile(gamerId: string) {
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useQuery({
    queryKey: gamerKeys.gamerProfile(gamerId),
    queryFn: () => service.getGamerProfile(gamerId),
    enabled: !!gamerId,
  });
}

