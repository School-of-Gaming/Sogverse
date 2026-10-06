import type { CatalogueImagePurpose } from "@/types";

/**
 * Which set of purpose-specific catalogue copy a purpose reads, under both
 * `admin.products.imageCatalogue.forPurpose` and
 * `admin.products.imagePicker.forPurpose`. A purpose decides who uses its
 * entries — a product picture is a product's, a Library cover an article's, a
 * landing picture a landing page's —
 * so it decides what the catalogue calls itself and what it counts, and what
 * the picker says it changes.
 */
export const CATALOGUE_COPY = {
  product: "forPurpose.product",
  library_cover: "forPurpose.libraryCover",
  landing_image: "forPurpose.landingImage",
} as const satisfies Record<CatalogueImagePurpose, string>;
