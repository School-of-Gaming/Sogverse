"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProductsByType } from "@/services/products";
import { ProductRows } from "./product-rows";
import { ClubProductFilters } from "./club-product-filters";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface ProductListPageProps {
  productType: ProductType;
}

export function ProductListPage({ productType }: ProductListPageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.products");
  const label = t(`types.${config.i18nKey}.label`);
  const plural = t(`types.${config.i18nKey}.plural`);
  const { data: products, isLoading } = useProductsByType(productType);

  // Clubs get the day / educator / language|municipality filter bar; camps and
  // events render the plain list.
  const isClubType =
    productType === "consumer_club" || productType === "municipality_club";

  return (
    // Reserve the document scrollbar gutter: the list (and, for clubs, the
    // filters) can flip the page between fits-the-viewport and needs-a-scrollbar
    // as data loads or filters narrow it — see html:has() rule in globals.css.
    <div className="space-y-6" data-reserve-scroll-gutter>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{plural}</h1>
          <p className="text-muted-foreground">
            {t("list.subtitle", { plural })}
          </p>
        </div>
        <Link
          href={`/admin/${config.routeSlug}/new`}
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
              className="h-20 animate-pulse rounded-lg border border-input bg-muted"
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

      {!isLoading &&
        products &&
        products.length > 0 &&
        (isClubType ? (
          <ClubProductFilters productType={productType} products={products} />
        ) : (
          <ProductRows products={products} productType={productType} />
        ))}
    </div>
  );
}
