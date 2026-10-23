/**
 * The guides' query keys, in a module of their own because two features name
 * them: the guides' own hooks, and the landing page writes that change where a
 * guide is offered. The landing page hooks cannot import them from
 * `guides.queries.ts`, which already imports theirs, so the keys sit where
 * both sides can reach them without a cycle.
 */
export const guideKeys = {
  all: ["guides"] as const,
  admin: () => [...guideKeys.all, "admin"] as const,
  adminList: () => [...guideKeys.admin(), "list"] as const,
  adminDetail: (id: string) => [...guideKeys.admin(), "detail", id] as const,
};
