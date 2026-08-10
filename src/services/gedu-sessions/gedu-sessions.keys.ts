/**
 * Cache keys for the gedu session feed.
 *
 * The key hierarchy is what makes the invalidations cheap to reason about: a
 * write to any part of one group's workspace invalidates that group's feed key,
 * and anything that can change a backlog also invalidates the dashboard summary
 * key — because the badge on the card and the alerts in the feed are two views
 * of one number and must never disagree.
 *
 * **Deliberately not in `gedu-sessions.queries.ts`.** That file is `"use
 * client"`, and every export of a client module is a client *reference* as far
 * as the RSC graph is concerned — a server component that imports one and calls
 * it gets a proxy that throws, not the function. The group workspace's route
 * seeds this cache server-side and must name the very same key the hook reads,
 * so the key factory has to live somewhere both halves can call it. Here.
 */
export const geduSessionKeys = {
  all: ["gedu-sessions"] as const,
  feeds: () => [...geduSessionKeys.all, "feed"] as const,
  feed: (groupId: string) => [...geduSessionKeys.feeds(), groupId] as const,
  summaries: () => [...geduSessionKeys.all, "summaries"] as const,
};
