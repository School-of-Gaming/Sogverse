"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { TokensService } from "./tokens.service";

const tokenKeys = {
  all: ["tokens"] as const,
  balance: (userId: string) => [...tokenKeys.all, "balance", userId] as const,
  transactions: (userId: string) => [...tokenKeys.all, "transactions", userId] as const,
  subscription: (userId: string) => [...tokenKeys.all, "subscription", userId] as const,
};

export function useTokenBalance(userId: string, enabled = true) {
  const supabase = getClient();
  const service = new TokensService(supabase);

  return useQuery({
    queryKey: tokenKeys.balance(userId),
    queryFn: () => service.getBalance(userId),
    enabled: !!userId && enabled,
  });
}

export function useTokenTransactions(userId: string) {
  const supabase = getClient();
  const service = new TokensService(supabase);

  return useQuery({
    queryKey: tokenKeys.transactions(userId),
    queryFn: () => service.getTransactions(userId),
    enabled: !!userId,
  });
}

export function useSubscription(userId: string) {
  const supabase = getClient();
  const service = new TokensService(supabase);

  return useQuery({
    queryKey: tokenKeys.subscription(userId),
    queryFn: () => service.getSubscription(userId),
    enabled: !!userId,
  });
}

export function useSubscriptionDetails(userId: string) {
  const supabase = getClient();
  const service = new TokensService(supabase);

  return useQuery({
    queryKey: [...tokenKeys.subscription(userId), "details"] as const,
    queryFn: () => service.getSubscriptionDetails(),
    enabled: !!userId,
  });
}

export function useAdjustTokens() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new TokensService(supabase);

  return useMutation({
    mutationFn: ({ userId, amount, description }: { userId: string; amount: number; description: string }) =>
      service.adjustBalance(userId, amount, description),
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: tokenKeys.balance(userId) });
      queryClient.invalidateQueries({ queryKey: tokenKeys.transactions(userId) });
    },
  });
}

export function useCancelSubscription(userId: string) {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new TokensService(supabase);

  return useMutation({
    mutationFn: () => service.cancelSubscription(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tokenKeys.subscription(userId) });
    },
  });
}