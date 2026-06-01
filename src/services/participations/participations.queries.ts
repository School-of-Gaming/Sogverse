"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useLocale } from "next-intl";
import { getClient } from "@/lib/supabase/client";
import { resolveLocale } from "@/lib/constants/locales";
import { expandUpcomingSessions } from "@/lib/upcoming-sessions";
import { useNow } from "@/providers";
import type { SessionAudience, SubscriptionFrequency } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { NextSessionCardProps } from "@/components/parent/NextSessionCard";
import {
  ParticipationsService,
  type CreateParticipationInput,
  type JoinWaitlistInput,
  type MyUpcomingSessionRow,
} from "./participations.service";
import { productKeys } from "../products";

export const participationKeys = {
  all: ["participations"] as const,
  mine: () => [...participationKeys.all, "mine"] as const,
  myUpcomingSessions: (audience: SessionAudience) =>
    [...participationKeys.all, "my-upcoming-sessions", audience] as const,
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
 * Drives the dashboard Sessions section on both `/parent` and `/gamer`.
 * Fetches the logged-in user's active, placed participations (filtered by
 * audience — `customer` for the parent dashboard, `gamer` for the gamer
 * dashboard) and expands them into a time-sorted list of concrete upcoming
 * sessions (one entry per occurrence). `voiceIsOpen` and the
 * window-closed cut re-derive on every tick of `useNow()` so the live ↔
 * locked flip happens without a refetch.
 *
 * `initialData` is **required** — every consumer pairs the hook with a
 * server-side prefetch in the page's Server Component (see
 * `parent/page.tsx` and `gamer/page.tsx`) so the first client render has
 * the rows ready and the section paints with no loading state. Mutations
 * elsewhere (`useCreateParticipation`, `useJoinWaitlist`) still cascade
 * through `participationKeys.all` to refetch; the prefetch only affects
 * the initial render.
 */
export function useMyUpcomingSessions(
  audience: SessionAudience,
  options: { initialData: MyUpcomingSessionRow[] },
): NextSessionCardProps[] {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  const locale = resolveLocale(useLocale());
  const now = useNow();

  const query = useQuery({
    queryKey: participationKeys.myUpcomingSessions(audience),
    queryFn: () => service.getMyUpcomingSessions(audience),
    initialData: options.initialData,
  });

  return useMemo(
    () => expandUpcomingSessions(query.data, now, locale),
    [query.data, now, locale],
  );
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
  frequency: SubscriptionFrequency | null,
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
      queryClient.invalidateQueries({ queryKey: productKeys.all });
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
      queryClient.invalidateQueries({ queryKey: productKeys.all });
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
          table: "product_seat_counts",
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
