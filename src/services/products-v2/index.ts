export { ProductsV2Service } from "./products-v2.service";
export type {
  ProductV2WithDetails,
  ProductV2DetailRow,
  ProductV2AdminDetailRow,
  ProductTranslationInput,
  ScheduleSlotInput,
  PriceInput,
  CreateProductV2Input,
  UpdateProductV2Input,
} from "./products-v2.service";
export {
  productV2Keys,
  useProductsV2ByType,
  useVisibleProductsV2ByType,
  useMyGeduAssignedProducts,
  useProductV2Detail,
  useProductV2Admin,
  useGeduProductDetail,
  useCreateProductV2,
  useUpdateProductV2,
} from "./products-v2.queries";
export {
  referenceKeys,
  useTopicsV2,
  useTagsV2,
  useHolidayCalendarsV2,
  useSiteDetailsV2,
  useCreateTopicV2,
  useCreateTagV2,
  useUpdateSiteNotesV2,
  type SiteDetailsBundle,
  type HolidayCalendarWithDates,
  type CreateTopicV2Input,
  type CreateTagV2Input,
  type UpdateSiteNotesV2Input,
} from "./reference-data.queries";
export { fxKeys, useFxRatesFromEur, type FxRates } from "./fx.queries";
