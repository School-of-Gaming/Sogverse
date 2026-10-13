import { getTranslations } from "next-intl/server";
import { AdminHub } from "@/components/admin/hubs/admin-hub";
import {
  ProductListCreateAction,
  ProductListPage,
} from "@/components/admin/products/product-list-page";

export default async function ProductsPage() {
  const t = await getTranslations("admin.products");

  return (
    <AdminHub
      hub="products"
      description={t("list.subtitle")}
      action={<ProductListCreateAction />}
    >
      <ProductListPage />
    </AdminHub>
  );
}
