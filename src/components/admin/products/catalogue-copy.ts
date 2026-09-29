import type { CatalogueImagePurpose } from "@/types";

/**
 * Which set of purpose-specific catalogue copy a purpose reads, under
 * `admin.products.imageCatalogue.forPurpose`. A purpose decides who uses its
 * entries — a product picture is a product's, a Library cover an article's —
 * so it decides what the catalogue calls itself and what it counts.
 */
export const CATALOGUE_COPY = {
  product: "forPurpose.product",
  library_cover: "forPurpose.libraryCover",
} as const satisfies Record<CatalogueImagePurpose, string>;
