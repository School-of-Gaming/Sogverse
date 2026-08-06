"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useLocale } from "next-intl";
import { getClient } from "@/lib/supabase/client";
import { resolveLocale } from "@/lib/constants/locales";
import { CONFIRMATION_POLL_INTERVAL_MS } from "@/lib/constants/participations";
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
import { participationKeys } from "./participations.keys";

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
  const rows = useMyUpcomingSessionRows(audience, options);
  const locale = resolveLocale(useLocale());
  const now = useNow();

  return useMemo(
    () => expandUpcomingSessions(rows, now, locale),
    [rows, now, locale],
  );
}

/**
 * The same rows, **unexpanded** — the read on its own, with no adapter over it.
 *
 * The family dashboards want the rows themselves: the roll-up that turns a row
 * into an enrollment card is a function of the viewer's locale and zone and has
 * to re-derive on every clock tick, so it belongs in a client hook of its own
 * rather than baked into this query. Splitting the fetch out from the expansion
 * is what lets two adapters sit over one read.
 *
 * Both hooks share this query key, so they share one cache entry and one fetch
 * no matter how many of them a page mounts. `initialData` is required for the
 * reason it is required above: every consumer server-prefetches these rows
 * because they decide the page's geometry, and a page whose geometry arrives
 * after the first frame is one that moves under the reader.
 */
export function useMyUpcomingSessionRows(
  audience: SessionAudience,
  options: { initialData: MyUpcomingSessionRow[] },
): MyUpcomingSessionRow[] {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);

  return useQuery({
    queryKey: participationKeys.myUpcomingSessions(audience),
    queryFn: () => service.getMyUpcomingSessions(audience),
    initialData: options.initialData,
  }).data;
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
  const rows = useMyWaitlistRows(audience, options);
  const locale = resolveLocale(useLocale());

  return useMemo(() => toWaitlistEntries(rows, locale), [rows, locale]);
}

/**
 * The waitlist rows unexpanded — the counterpart of
 * {@link useMyUpcomingSessionRows}, and there for the same reason: the family
 * dashboards render a place in line as a card in the same list as every seat,
 * built by the same locale- and zone-aware roll-up, so they consume the row
 * rather than this read's own adapter. One query key, one cache entry, one
 * fetch.
 */
export function useMyWaitlistRows(
  audience: SessionAudience,
  options: { initialData: MyWaitlistRow[] },
): MyWaitlistRow[] {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);

  return useQuery({
    queryKey: participationKeys.myWaitlist(audience),
    queryFn: () => service.getMyWaitlistEntries(audience),
    initialData: options.initialData,
  }).data;
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
 *
 * **The invalidation is returned, not fired and forgotten**, so React Query
 * awaits it before running the caller's own `onSuccess`. That is what gives a
 * caller a moment that means "the refetch has settled" — and it has to exist,
 * because the refetch is allowed to fail. A DELETE that succeeded followed by a
 * refetch that didn't leaves React Query holding the previous rows, so the card
 * the parent just left is still on screen: without a settled signal its
 * committing flag would never clear and it would sit dimmed and unclickable
 * until a reload. Clearing after this promise resolves is still clearing after
 * the outcome — on the ordinary path the row is gone and the card unmounted
 * with it, which is what the disabled-state rule wants; on the failed-refetch
 * path the card comes back to life and can be retried.
 */
export function useLeaveWaitlist() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  return useMutation({
    mutationFn: (input: LeaveWaitlistInput) => service.leaveWaitlist(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: participationKeys.all }),
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
      ]),
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

/**
 * Waits for the participation a paid Checkout Session bought to appear. Only
 * the confirmation page's finalizing state mounts this, and only when the row
 * is not there on the server render — the webhook that writes it normally lands
 * before Stripe redirects, so in the ordinary case this hook never runs at all.
 *
 * Polls on a fixed interval and stops the moment the row exists; the caller
 * refreshes the server render from there, which unmounts this. No `staleTime`
 * games: the whole point is to see a write that happened elsewhere.
 *
 * `enabled` is how the caller ends the wait. This hook deliberately owns no
 * clock — how long to keep asking is the caller's decision, and it is not
 * open-ended (see the finalizing component).
 */
export function useCheckoutConfirmation(
  checkoutSessionId: string,
  options?: { enabled?: boolean },
) {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);
  return useQuery({
    queryKey: participationKeys.byCheckoutSession(checkoutSessionId),
    queryFn: () => service.getConfirmationByCheckoutSession(checkoutSessionId),
    enabled: options?.enabled ?? true,
    refetchInterval: (query) =>
      query.state.data ? false : CONFIRMATION_POLL_INTERVAL_MS,
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
