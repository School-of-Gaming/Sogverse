/**
 * Cache keys for the admin product's session document.
 *
 * One key per product, because that is the granularity of the read: the panel
 * shows every group on the product and lets the admin pick between them, so a
 * write to any group's notes, register or report invalidates the one document
 * they all came out of.
 *
 * **A file of its own rather than a corner of the queries module**, matching the
 * gedu feed's arrangement and for the same reason: the queries file is `"use
 * client"`, and every export of a client module is a client *reference* to the
 * RSC graph, so a server component that imported the factory would get a proxy
 * that throws. Nothing seeds this cache server-side today; the split costs
 * nothing and is what makes seeding it later a one-line change rather than a
 * file move.
 */
export const adminSessionKeys = {
  all: ["admin-sessions"] as const,
  products: () => [...adminSessionKeys.all, "product"] as const,
  byProduct: (productId: string) =>
    [...adminSessionKeys.products(), productId] as const,
};
