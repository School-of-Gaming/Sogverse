export { ProductsService } from "./products.service";
export type {
  ProductWithDetails,
  AdminProductListRow,
  AdminProductListFilters,
  AdminProductListPage,
  ProductLocationRow,
  ProductDetailRow,
  ProductAdminDetailRow,
  ProductTranslationInput,
  ScheduleSlotInput,
  PriceInput,
  CreateProductInput,
  UpdateProductInput,
  ProductWriteResult,
} from "./products.service";
export {
  productKeys,
  useProductsByType,
  useAdminProductList,
  useProductListFacets,
  useVisibleProductsByTypes,
  useProductDetail,
  useProductAdmin,
  usePlannedSessions,
  useCreateProduct,
  useUpdateProduct,
} from "./products.queries";
export type { ProductListFacetsRow } from "./products.contracts";
export {
  referenceKeys,
  useConsentDocuments,
  useUpdateSiteNotes,
  type ConsentDocumentOption,
  type UpdateSiteNotesInput,
} from "./reference-data.queries";
