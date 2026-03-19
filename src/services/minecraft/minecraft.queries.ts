"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
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

export function useMinecraftAccount(userId: string) {
  const supabase = getClient();
  const service = new MinecraftService(supabase);

  return useQuery({
    queryKey: minecraftKeys.account(userId),
    queryFn: () => service.getMinecraftAccount(userId),
    enabled: !!userId,
  });
}

export function useVerifyMinecraft() {
  const supabase = getClient();
  const service = new MinecraftService(supabase);

  return useMutation({
    mutationFn: (username: string) => service.verifyMinecraftUsername(username),
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
