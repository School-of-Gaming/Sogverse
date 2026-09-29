import type { CatalogueImagePurpose } from "@/types";

/**
 * The catalogue's query keys, in a module of their own because three features
 * name them: the catalogue's own hooks, and the product and Library writes
 * that change what the usage map answers. The Library's hooks cannot import
 * them from `catalogue-images.queries.ts`, which already imports theirs, so
 * the keys sit where every side can reach them without a cycle.
 */
export const catalogueImageKeys = {
  all: ["catalogue-images"] as const,
  list: (purpose: CatalogueImagePurpose) =>
    [...catalogueImageKeys.all, "list", purpose] as const,
};

/**
 * Which products and which Library articles use which entry. Derived from a
 * products read and an articles read together, so a write to either can change
 * the answer: every catalogue mutation invalidates it, and so do a product's
 * create and update and every Library write (create, save, publish,
 * unpublish). A map left stale would show a live cover as unused, and offer to
 * remove it without a word about who uses it.
 */
export const catalogueImageUsageKey = [
  ...catalogueImageKeys.all,
  "usage",
] as const;
