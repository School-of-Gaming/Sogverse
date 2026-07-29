"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useLocale } from "next-intl";
import { getClient } from "@/lib/supabase/client";
import { resolveLocale } from "@/lib/constants/locales";
import {
  expandUpcomingSessions,
  type UpcomingSessionEntry,
} from "@/lib/upcoming-sessions";
import { useNow } from "@/providers";
import type { SessionAudience } from "@/types";
import {
  toWaitlistEntries,
  type WaitlistEntry,
} from "@/lib/waitlist-entries";
import {
  ParticipationsService,
  type CreateParticipationInput,
  type JoinWaitlistInput,
  type LeaveWaitlistInput,
  type MyUpcomingSessionRow,
  type MyWaitlistRow,
  type ParticipationCounts,
} from "./participations.service";
import { productKeys } from "../products";

export const participationKeys = {
  all: ["participations"] as const,
  myUpcomingSessions: (audience: SessionAudience) =>
    [...participationKeys.all, "my-upcoming-sessions", audience] as const,
  myWaitlist: (audience: SessionAudience) =>
    [...participationKeys.all, "my-waitlist", audience] as const,
  countsByProducts: (productIds: string[]) =>
    [...participationKeys.all, "counts", { productIds: [...productIds].sort() }] as const,
};

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
): UpcomingSessionEntry[] {
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
 * Drives the "On the waitlist" band on both `/parent` and `/gamer` — the
 * companion to `useMyUpcomingSessions`, filtered to the rows that one excludes.
 * Returns the viewer's waitlisted participations as cards, each carrying a
 * position recomputed live by the database (so it shrinks as people ahead of
 * them leave) and a product name resolved into the current UI locale.
 *
 * `initialData` is **required** for the same reason it is on the sessions hook:
 * both dashboards prefetch in their Server Component, so the band paints
 * populated on first frame rather than appearing under content the viewer is
 * already reading. Leaving a waitlist cascades through `participationKeys.all`
 * and refetches this like everything else.
 */
export function useMyWaitlist(
  audience: SessionAudience,
  options: { initialData: MyWaitlistRow[] },
): WaitlistEntry[] {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  const locale = resolveLocale(useLocale());

  const query = useQuery({
    queryKey: participationKeys.myWaitlist(audience),
    queryFn: () => service.getMyWaitlistEntries(audience),
    initialData: options.initialData,
  });

  return useMemo(
    () => toWaitlistEntries(query.data, locale),
    [query.data, locale],
  );
}

/**
 * Give up a waitlist spot. Invalidates the whole participation hierarchy — the
 * band the card sits in, and the seat counts on the product it came from, which
 * just gained a place in line for everyone behind them.
 *
 * The caller holds its own `committing` flag rather than reading
 * `mutation.isPending`: the card has to stay dimmed and the badge locked from
 * the click through to the row leaving the list, and `isPending` flips false
 * before `onSuccess` — let alone before the refetch lands. See the "Loading &
 * Disabled State" rule.
 */
export function useLeaveWaitlist() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  return useMutation({
    mutationFn: (input: LeaveWaitlistInput) => service.leaveWaitlist(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: participationKeys.all });
      queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}

// `initialData` (optional) is the server-prefetched seat counts from the shop
// page's Server Component (see `shop/page.tsx`), keyed on the same product ids
// the grid renders. When present the seat pills paint on the first frame with
// the products; the hook still refetches on mount.
export function useParticipationCounts(
  productIds: string[],
  options?: { initialData?: ParticipationCounts[] },
) {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  return useQuery({
    queryKey: participationKeys.countsByProducts(productIds),
    queryFn: () => service.getParticipationCounts(productIds),
    enabled: productIds.length > 0,
    initialData: options?.initialData,
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
