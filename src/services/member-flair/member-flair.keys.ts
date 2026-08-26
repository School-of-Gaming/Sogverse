/**
 * Cache keys for the group staff overlay.
 *
 * **Deliberately not in `member-flair.queries.ts`.** That file is `"use
 * client"`, and every export of a client module is a client *reference* as far
 * as the RSC graph is concerned — a server component that imports one and calls
 * it gets a proxy that throws, not the function. Anything that seeds this cache
 * server-side has to name the very same key the hook reads, so the key factory
 * has to live somewhere both halves can call it. Here.
 */
export const memberFlairKeys = {
  all: ["member-flair"] as const,
  overlays: () => [...memberFlairKeys.all, "overlay"] as const,
  overlay: (groupId: string) => [...memberFlairKeys.overlays(), groupId] as const,
};
