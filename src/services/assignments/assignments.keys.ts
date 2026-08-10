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
  assignedProductDetail: (productId: string | undefined) =>
    [...assignmentKeys.all, "assigned-product-detail", productId] as const,
};
