"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GamerService } from "./gamers.service";
import type { CreateGamerInput } from "@/types";

const gamerKeys = {
  all: ["gamers"] as const,
  myGamers: () => [...gamerKeys.all, "my-gamers"] as const,
  myParents: () => [...gamerKeys.all, "my-parents"] as const,
  linkedGamers: (parentId: string) =>
    [...gamerKeys.all, "linked", parentId] as const,
  linkedParents: (gamerId: string) =>
    [...gamerKeys.all, "linked-parents", gamerId] as const,
  links: (parentId: string) => [...gamerKeys.all, "links", parentId] as const,
};

export function useMyGamers() {
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useQuery({
    queryKey: gamerKeys.myGamers(),
    queryFn: () => service.getMyGamers(),
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

export function useLinkGamer() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GamerService(supabase);

  return useMutation({
    mutationFn: ({ parentId, gamerId }: { parentId: string; gamerId: string }) =>
      service.linkGamer(parentId, gamerId),
    onSuccess: (_, { parentId }) => {
      queryClient.invalidateQueries({ queryKey: gamerKeys.myGamers() });
      queryClient.invalidateQueries({
        queryKey: gamerKeys.linkedGamers(parentId),
      });
    },
  });
}

