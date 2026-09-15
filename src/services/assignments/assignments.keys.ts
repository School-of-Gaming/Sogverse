/**
 * Cache keys for the gedu's assignment reads.
 *
 * **Deliberately not in `assignments.queries.ts`.** That file is `"use client"`,
 * and every export of a client module is a client *reference* as far as the RSC
 * graph is concerned — a server component that imports one and calls it gets a
 * proxy that throws, not the function. A route that server-prefetches into a
 * React Query cache has to name the very same key the hook reads, so the key
 * factory has to live somewhere both halves can call it. Here.
 */
export const assignmentKeys = {
  all: ["assignments"] as const,
  myAssignedProducts: () =>
    [...assignmentKeys.all, "my-assigned-products"] as const,
  /**
   * The workspace document for one product — and, since 00260, for **one group
   * of it**.
   *
   * The group id is part of the key rather than a detail of the call because
   * the answer genuinely differs by it: a gedu covering a sibling group of a
   * product they already teach asks the same RPC for a different workspace, and
   * two documents sharing one cache entry would hand whichever arrived first to
   * whichever page asked second. `null` is the ordinary case — no group named,
   * resolve my assignment — and it is spelled out rather than omitted so the
   * key has one length.
   */
  assignedProductDetail: (
    productId: string | undefined,
    groupId: string | null = null,
  ) =>
    [
      ...assignmentKeys.all,
      "assigned-product-detail",
      productId,
      groupId,
    ] as const,
};
