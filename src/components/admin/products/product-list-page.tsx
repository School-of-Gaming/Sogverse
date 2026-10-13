"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useRoutedUrlParamState } from "@/components/admin/admin-list-url-state";
import { useAllProducts } from "@/services/products";
import {
  parseProductListType,
  productListTypeParam,
} from "@/lib/products/admin-product-list-type";
import { ProductListFilters } from "./product-list-filters";
import { PRODUCT_LIST_PARAMS } from "./product-list-url-state";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import { ROUTES } from "@/lib/constants";

// Every club, camp and event in one list, narrowed by a row of type chips.
export function ProductListPage() {
  const t = useTranslations("admin.products");
  // Read through the router rather than seeded from `window`: the create
  // button in the header is painted by the server and names the type.
  const [typeParam, setTypeParam] = useRoutedUrlParamState(
    PRODUCT_LIST_PARAMS.type,
  );
  const type = parseProductListType(typeParam);
  const { data: products, isLoading } = useAllProducts();

  return (
    // Reserve the document scrollbar gutter: the list (and the filter row) can
    // flip the page between fits-the-viewport and needs-a-scrollbar as data
    // loads or filters narrow it — see html:has() rule in globals.css.
    <div className="space-y-6" data-reserve-scroll-gutter>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("list.title")}</h1>
          <p className="text-muted-foreground">{t("list.subtitle")}</p>
        </div>
        {type !== null && (
          <Link href={ROUTES.admin.productNew(type)} className={buttonVariants()}>
            <Plus className="mr-1 h-4 w-4" />
            {t("list.new", {
              label: t(`types.${PRODUCT_TYPE_CONFIG[type].i18nKey}.label`),
            })}
          </Link>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-border bg-lifted"
            />
          ))}
        </div>
      )}

      {!isLoading && products && (
        // One `space-y-4` for the type chips, the filter row, the count line
        // and the rows: they are all direct children here (the component below
        // renders a fragment), so they share one rhythm. The chips render only
        // once the products have, so their counts never arrive into them.
        <div className="space-y-4">
          <ProductListFilters
            products={products}
            type={type}
            onTypeChange={(next) =>
              setTypeParam(next === null ? null : productListTypeParam(next))
            }
          />
        </div>
      )}
    </div>
  );
}
