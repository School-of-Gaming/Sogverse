"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getClient } from "@/lib/supabase/client";
import { CONFIRMATION_POLL_INTERVAL_MS } from "@/lib/constants/participations";
import type { SessionAudience } from "@/types";
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
 * `initialDataUpdatedAt` for a seed that may be a failure fallback.
 *
 * The rule in one line: **`null` is a prefetch that threw, and it is not the
 * same value as one that returned nothing.** A caller that flattens the failure
 * to `[]` and seeds it normally gets it stamped as freshly fetched, and against
 * the 60-second `staleTime` the client never asks again — so a transient server
 * error becomes a page that tells a family they are enrolled in nothing and
 * then leaves that on screen. Answering `0` marks the seed stale on arrival and
 * the query refetches on mount; `undefined` keeps the default, which is right
 * for a genuinely empty answer, because that *is* an answer.
 *
 * It lives here, beside the hooks whose option it feeds and the paragraph that
 * explains the option, because every family surface that prefetches these rows
 * has to make the same call — and a second copy of a rule this quiet is one
 * that gets fixed in one place and not the other.
 */
export function seedAge(prefetched: readonly unknown[] | null): number | undefined {
  return prefetched === null ? 0 : undefined;
}

/**
 * The viewer's active, placed participations — the rows, with no adapter over
 * them.
 *
 * Filtered by audience: `customer` reaches the linked children's seats, `gamer`
 * only their own. What the family dashboards want is the rows themselves, since
 * the roll-up that turns a row into an enrollment card is a function of the
 * viewer's locale and zone and has to re-derive on every clock tick — so it
 * lives in a client hook of its own rather than baked into this query, and the
 * live ↔ locked flip on a Join happens on the shared clock with no refetch.
 *
 * One query key, one cache entry, one fetch, however many consumers a page
 * mounts. `initialData` is **required**: every consumer server-prefetches these
 * rows because they decide the page's geometry, and a page whose geometry
 * arrives after the first frame is one that moves under the reader. Mutations
 * elsewhere (`useCreateParticipation`, `useJoinWaitlist`) still cascade through
 * `participationKeys.all` to refetch; the prefetch only affects the first
 * render.
 *
 * **`initialDataUpdatedAt` is how a caller says "this prefetch failed".** Seeded
 * data is stamped as fetched *now*, and with a 60-second `staleTime` that means
 * the client does not refetch — which is exactly right for a prefetch that
 * genuinely returned no rows, and quietly wrong for one that threw and degraded
 * to `[]`. The two are indistinguishable in the value, so the caller that knows
 * the difference passes `0` on the failure path: the seed is then stale on
 * arrival, the client refetches on mount, and an empty first frame corrects
 * itself instead of persisting as a page that looks complete and is not.
 */
export function useMyUpcomingSessionRows(
  audience: SessionAudience,
  options: {
    initialData: MyUpcomingSessionRow[];
    /** Pass `0` when `initialData` is a failure fallback rather than an answer. */
    initialDataUpdatedAt?: number;
  },
): MyUpcomingSessionRow[] {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);

  return useQuery({
    queryKey: participationKeys.myUpcomingSessions(audience),
    queryFn: () => service.getMyUpcomingSessions(audience),
    initialData: options.initialData,
    initialDataUpdatedAt: options.initialDataUpdatedAt,
  }).data;
}

/**
 * The viewer's waitlisted participations — the counterpart of
 * {@link useMyUpcomingSessionRows}, filtered to exactly the rows that one
 * excludes, each carrying a position the database recomputes on read (so it
 * shrinks as people ahead of them leave).
 *
 * Rows rather than cards, for the reason given above: the family dashboards
 * render a place in line as a card in the same list as every seat, built by the
 * same locale- and zone-aware roll-up. Leaving a waitlist cascades through
 * `participationKeys.all` and refetches this like everything else.
 *
 * `initialDataUpdatedAt` carries the same meaning it does on the sessions hook:
 * pass `0` when the seed is a failure fallback rather than an answer, so it
 * arrives stale and the client fetches instead of trusting it for a minute.
 */
export function useMyWaitlistRows(
  audience: SessionAudience,
  options: {
    initialData: MyWaitlistRow[];
    /** Pass `0` when `initialData` is a failure fallback rather than an answer. */
    initialDataUpdatedAt?: number;
  },
): MyWaitlistRow[] {
  const supabase = getClient();
  const service = new ParticipationsService(supabase);

  return useQuery({
    queryKey: participationKeys.myWaitlist(audience),
    queryFn: () => service.getMyWaitlistEntries(audience),
    initialData: options.initialData,
    initialDataUpdatedAt: options.initialDataUpdatedAt,
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
