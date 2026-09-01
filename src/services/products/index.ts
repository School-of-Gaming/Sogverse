export { ProductsService } from "./products.service";
export type {
  ProductWithDetails,
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
  useVisibleProductsByTypes,
  useProductDetail,
  useProductAdmin,
  useCreateProduct,
  useUpdateProduct,
} from "./products.queries";
export {
  referenceKeys,
  useHolidayCalendars,
  useConsentDocuments,
  useUpdateSiteNotes,
  type ConsentDocumentOption,
  type HolidayCalendarWithDates,
  type UpdateSiteNotesInput,
} from "./reference-data.queries";
