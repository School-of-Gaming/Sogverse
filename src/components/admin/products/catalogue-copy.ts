import type { CatalogueImagePurpose } from "@/types";

/**
 * Which set of purpose-specific catalogue copy a purpose reads, under both
 * `admin.products.imageCatalogue.forPurpose` and
 * `admin.products.imagePicker.forPurpose`. A purpose decides who uses its
 * entries — a product picture is a product's, a Library cover an article's, a
 * landing picture a landing page's, a spotlight picture a spotlight's —
 * so it decides what the catalogue calls itself and what it counts, and what
 * the picker says it changes. The three landing picture shapes are one set,
 * since a page uses each the same way.
 */
export const CATALOGUE_COPY = {
  product: "forPurpose.product",
  library_cover: "forPurpose.libraryCover",
  landing_image: "forPurpose.landingImage",
  landing_square_image: "forPurpose.landingImage",
  landing_portrait_image: "forPurpose.landingImage",
  spotlight_image: "forPurpose.spotlightImage",
} as const satisfies Record<CatalogueImagePurpose, string>;
