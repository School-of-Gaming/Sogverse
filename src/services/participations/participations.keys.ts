import type { SessionAudience } from "@/types";

/**
 * Cache keys for everything hanging off a family's participations.
 *
 * `all` is the root the whole family side invalidates through: a mutation that
 * changes what a family is enrolled in — leaving a waitlist, buying a seat,
 * cancelling a subscription — cascades from here and refetches every view built
 * on those rows, the dashboards' and the club pages' alike. Anything keyed under
 * a participation belongs beneath it for exactly that reason, including feature
 * directories of their own (see the family product feed's keys).
 *
 * **Deliberately not in `participations.queries.ts`.** That file is `"use
 * client"`, and every export of a client module is a client *reference* as far
 * as the RSC graph is concerned — a server component that imports one and calls
 * it gets a proxy that throws, not the function. Routes seed this cache
 * server-side and must name the very same key the hook reads, so the factory has
 * to live somewhere both halves can call it. Here.
 */
export const participationKeys = {
  all: ["participations"] as const,
  myUpcomingSessions: (audience: SessionAudience) =>
    [...participationKeys.all, "my-upcoming-sessions", audience] as const,
  myWaitlist: (audience: SessionAudience) =>
    [...participationKeys.all, "my-waitlist", audience] as const,
  countsByProducts: (productIds: string[]) =>
    [
      ...participationKeys.all,
      "counts",
      { productIds: [...productIds].sort() },
    ] as const,
  byCheckoutSession: (checkoutSessionId: string) =>
    [...participationKeys.all, "checkout-session", checkoutSessionId] as const,
};
