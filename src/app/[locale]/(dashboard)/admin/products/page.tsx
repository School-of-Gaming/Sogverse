import { AdminHub } from "@/components/admin/hubs/admin-hub";
import { ProductListPage } from "@/components/admin/products/product-list-page";

export default function ProductsPage() {
  return (
    <AdminHub hub="products">
      <ProductListPage />
    </AdminHub>
  );
}
