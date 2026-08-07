import { participationKeys } from "@/services/participations/participations.keys";

/**
 * Cache keys for the family product feed.
 *
 * **Nested under the participations root, not rooted on its own.** A family feed
 * is a view of one participation — it exists because that row exists, it is
 * named by that row's id, and every event that can change what the page says is
 * an event about participations: leaving a waitlist, a seat being placed, a
 * subscription cancelled. Those mutations already cascade from
 * `participationKeys.all`, so nesting here means they invalidate this feed for
 * free and can never be the mutation that forgot to. A sibling root would have
 * been one more key every future participation mutation had to remember.
 *
 * (Cancellation is the case worth naming: it happens in Stripe's billing portal
 * rather than through a mutation of ours, so nothing invalidates at the moment
 * it lands. The page picks it up on its next fetch, and the clamp is applied
 * client-side from the subscription's paid-through instant either way.)
 *
 * **Deliberately not in `family-product-feed.queries.ts`,** for the same reason
 * the participations and gedu-session factories are not in theirs: that file is
 * `"use client"`, so a server component importing from it gets a client
 * reference rather than the function. The club-page route seeds this cache
 * server-side and must name the very key the hook reads.
 */
export const familyProductFeedKeys = {
  all: [...participationKeys.all, "family-product-feed"] as const,
  feed: (participationId: string) =>
    [...familyProductFeedKeys.all, participationId] as const,
};
