export { CatalogueImagesService } from "./catalogue-images.service";
export type {
  LibraryArticleImageUser,
  CatalogueImageUsage,
  CatalogueImageUser,
  LandingPageImageUser,
  ProductPictureUser,
} from "./catalogue-images.service";
export { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
export type { CatalogueImagePurposeSpec } from "@/lib/images/catalogue-image-purposes";
export {
  CATALOGUE_IMAGE_ERROR_CODES,
  CATALOGUE_IMAGE_FALLBACK_LABEL,
  CATALOGUE_IMAGE_LABEL_MAX_LENGTH,
  CATALOGUE_IMAGE_MAX_BYTES,
  CATALOGUE_IMAGE_MIME_BY_EXT,
  catalogueImagePurpose,
  catalogueImageLabel,
  renameCatalogueImageBody,
  resolveCatalogueImageExtension,
} from "./catalogue-images.contracts";
export type {
  DeleteCatalogueImageResult,
  CatalogueImageErrorCode,
  CatalogueImageExtension,
  RenameCatalogueImageBody,
  ReplaceCatalogueImageResult,
  UploadCatalogueImageResult,
} from "./catalogue-images.contracts";
export {
  catalogueImageKeys,
  catalogueImageUsageKey,
} from "./catalogue-images.keys";
export {
  useDeleteCatalogueImage,
  useCatalogueImageUsage,
  useCatalogueImages,
  useRenameCatalogueImage,
  useReplaceCatalogueImage,
  useUploadCatalogueImage,
} from "./catalogue-images.queries";
