export { ProductsService } from "./products.service";
export type {
  ProductWithGame,
  CreateProductInput,
  UpdateProductInput,
} from "./products.service";
export {
  useVisibleProducts,
  useAllProducts,
  useProduct,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useToggleProductVisibility,
} from "./products.queries";
