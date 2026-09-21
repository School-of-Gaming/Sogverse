/**
 * Cache keys for session substitutions.
 *
 * There is one read on this key — the pool of open requests a gedu could take —
 * and the hierarchy is still written out, because every substitution write invalidates
 * the root rather than the leaf: approving an offer removes a line from the
 * pool, and a mutation that had to name each affected leaf would be a second
 * place the relationship between the writes and the reads is described.
 *
 * Everything else a substitution write changes lives in somebody else's document — the
 * two staff feeds, the gedu's assignment rows, the admin dashboard — so the
 * mutations invalidate those roots too. That fan-out is stated once, in the
 * queries module, rather than per hook.
 *
 * **Deliberately not in `session-substitution.queries.ts`.** That file is `"use
 * client"`, and every export of a client module is a client *reference* as far
 * as the RSC graph is concerned — a server component that imports one and calls
 * it gets a proxy that throws, not the function. A route that wants to seed
 * this cache server-side has to name the very same key the hook reads, so the
 * factory has to live somewhere both halves can call it. Here.
 */
export const sessionSubstitutionKeys = {
  all: ["session-substitution"] as const,
  openRequests: () => [...sessionSubstitutionKeys.all, "open-requests"] as const,
};
