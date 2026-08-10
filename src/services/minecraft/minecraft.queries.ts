"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { geduSessionKeys } from "@/services/gedu-sessions/gedu-sessions.keys";
import type { MinecraftAccount } from "@/types";
import { MinecraftService } from "./minecraft.service";

export const minecraftKeys = {
  all: ["minecraft"] as const,
  myAccount: () => [...minecraftKeys.all, "my-account"] as const,
  account: (userId: string) => [...minecraftKeys.all, "account", userId] as const,
};

export function useMyMinecraftAccount() {
  const supabase = getClient();
  const service = new MinecraftService(supabase);

  return useQuery({
    queryKey: minecraftKeys.myAccount(),
    queryFn: () => service.getMyMinecraftAccount(),
  });
}

/**
 * Somebody else's saved handle — a parent reading their own child's row, or an
 * admin reading anyone's. Seed `initialData` from a server fetch where the page
 * already has the row, so it paints complete on the first frame.
 */
export function useMinecraftAccount(
  userId: string,
  options?: { initialData?: MinecraftAccount | null },
) {
  const supabase = getClient();
  const service = new MinecraftService(supabase);

  return useQuery({
    queryKey: minecraftKeys.account(userId),
    queryFn: () => service.getMinecraftAccount(userId),
    enabled: !!userId,
    initialData: options?.initialData,
  });
}

export function useVerifyMinecraft() {
  const supabase = getClient();
  const service = new MinecraftService(supabase);

  return useMutation({
    mutationFn: (username: string) => service.verifyMinecraftUsername(username),
  });
}

/**
 * A gedu editing a group member's username.
 *
 * `groupId` is not sent to the server — the RPC re-derives what the caller may
 * touch from their own assignments — it is here purely so the invalidation can
 * name the one feed whose roster row just changed.
 */
export function useUpdateGroupMemberMinecraft(groupId: string) {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new MinecraftService(supabase);

  return useMutation({
    mutationFn: (vars: { gamerId: string; minecraftUsername: string | null }) =>
      service.updateGroupMemberMinecraft(vars.gamerId, vars.minecraftUsername),
    onSuccess: (_result, vars) => {
      // The workspace's roster comes from the feed document, so that is what
      // has to refetch for the row to show its new (verified) state.
      queryClient.invalidateQueries({ queryKey: geduSessionKeys.feed(groupId) });
      queryClient.invalidateQueries({
        queryKey: minecraftKeys.account(vars.gamerId),
      });
    },
  });
}

export function useUpdateMyMinecraft() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new MinecraftService(supabase);

  return useMutation({
    mutationFn: (minecraftUsername: string | null) =>
      service.updateMyMinecraft(minecraftUsername),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: minecraftKeys.all });
    },
  });
}
