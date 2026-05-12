"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getClient } from "@/lib/supabase/client";
import type { SubscriptionFrequencyV2 } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import {
  ParticipationsService,
  type CreateParticipationInput,
  type JoinWaitlistInput,
} from "./participations.service";
import { productV2Keys } from "../products-v2";

export const participationKeys = {
  all: ["participations-v2"] as const,
  mine: () => [...participationKeys.all, "mine"] as const,
  myFamilySubs: () => [...participationKeys.all, "my-family-subs"] as const,
  countsByProducts: (productIds: string[]) =>
    [...participationKeys.all, "counts", { productIds: [...productIds].sort() }] as const,
  myFamilySub: (frequency: string, currency: string) =>
    [...participationKeys.all, "family-sub", { frequency, currency }] as const,
};

export function useMyParticipations({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  return useQuery({
    queryKey: participationKeys.mine(),
    queryFn: () => service.getMyParticipations(),
    enabled,
  });
}

/**
 * The current customer's family subscriptions plus their items. Drives the
 * "Family subscriptions" section on the purchased-detail placeholder so
 * Stripe↔DB drift (sub charging but participation flagged non-sub-covered)
 * is visible at a glance.
 *
 * Public surfaces (e.g. the product detail page, which any role can view)
 * must pass `enabled: isCustomer` — the underlying API route is gated to
 * customers and returns 403 to other roles.
 */
export function useMyFamilySubs({ enabled = true }: { enabled?: boolean } = {}) {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  return useQuery({
    queryKey: participationKeys.myFamilySubs(),
    queryFn: () => service.getMyFamilySubs(),
    enabled,
  });
}

export function useParticipationCounts(productIds: string[]) {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  return useQuery({
    queryKey: participationKeys.countsByProducts(productIds),
    queryFn: () => service.getParticipationCounts(productIds),
    enabled: productIds.length > 0,
  });
}

/**
 * Whether the logged-in customer already has a live family sub at the
 * given (frequency, currency). The signup panel uses this to switch the
 * CTA copy from "Subscribe" → "Add to your subscription".
 */
export function useMyFamilySubAt(
  frequency: SubscriptionFrequencyV2 | null,
  currency: SupportedCurrency,
) {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  return useQuery({
    queryKey: participationKeys.myFamilySub(frequency ?? "_none", currency),
    queryFn: () =>
      frequency === null
        ? Promise.resolve(null)
        : service.getFamilySubAt(frequency, currency),
    enabled: frequency !== null,
  });
}

export function useCreateParticipation() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  return useMutation({
    mutationFn: (input: CreateParticipationInput) =>
      service.createParticipation(input),
    onSuccess: () => {
      // Cascade through the key hierarchy — "all" hits both mine + counts.
      queryClient.invalidateQueries({ queryKey: participationKeys.all });
      queryClient.invalidateQueries({ queryKey: productV2Keys.all });
    },
  });
}

export function useJoinWaitlist() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  return useMutation({
    mutationFn: (input: JoinWaitlistInput) => service.joinWaitlist(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: participationKeys.all });
      queryClient.invalidateQueries({ queryKey: productV2Keys.all });
    },
  });
}

/**
 * Subscribe to live seat-count updates for a single product on the detail
 * page. Browse pages don't subscribe per-card (a 30-card grid would open
 * 30 channels — wasted load); React Query's tab-focus refetch is good
 * enough at the list level.
 *
 * Per CLAUDE.md: realtime callbacks only invalidate queries — never run
 * Supabase data queries inside the callback (deadlock risk).
 */
export function useProductSeatCountsRealtime(productId: string | undefined) {
  const queryClient = useQueryClient();
  const supabase = getClient();

  useEffect(() => {
    if (!productId) return;
    const channel = supabase
      .channel(`product-seat-counts-${productId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "product_seat_counts_v2",
          filter: `product_id=eq.${productId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: participationKeys.countsByProducts([productId]),
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [productId, queryClient, supabase]);
}
