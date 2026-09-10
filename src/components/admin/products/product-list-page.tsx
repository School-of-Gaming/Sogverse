"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProductsByType } from "@/services/products";
import { ProductListFilters } from "./product-list-filters";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";
import { ROUTES } from "@/lib/constants";

interface ProductListPageProps {
  productType: ProductType;
}

export function ProductListPage({ productType }: ProductListPageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.products");
  const label = t(`types.${config.i18nKey}.label`);
  const plural = t(`types.${config.i18nKey}.plural`);
  const { data: products, isLoading } = useProductsByType(productType);

  return (
    // Reserve the document scrollbar gutter: the list (and the filter row) can
    // flip the page between fits-the-viewport and needs-a-scrollbar as data
    // loads or filters narrow it — see html:has() rule in globals.css.
    <div className="space-y-6" data-reserve-scroll-gutter>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{plural}</h1>
          <p className="text-muted-foreground">
            {t("list.subtitle", { plural })}
          </p>
        </div>
        <Link
          href={ROUTES.admin.productNew(productType)}
          className={buttonVariants()}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("list.new", { label })}
        </Link>
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

      {!isLoading && products && products.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("list.empty", { plural, label })}
          </CardContent>
        </Card>
      )}

      {!isLoading && products && products.length > 0 && (
        // One `space-y-4` for the narrowing controls and everything under them,
        // whichever type this is: the filter row, the count line and the rows
        // are all direct children here (the component below renders a
        // fragment), so the rhythm is identical across the four pages.
        <div className="space-y-4">
          <ProductListFilters productType={productType} products={products} />
        </div>
      )}
    </div>
  );
}
