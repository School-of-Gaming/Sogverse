"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useProductAdmin } from "@/services/products";
import { ProductFormEdit } from "./product-form-edit";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface EditProductPageProps {
  productType: ProductType;
  productId: string;
}

export function EditProductPage({
  productType,
  productId,
}: EditProductPageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());
  const label = t(`types.${config.i18nKey}.label`);

  const { data: product, isLoading } = useProductAdmin(productId);

  const detailsHref = `/admin/${config.routeSlug}/${productId}`;

  // Page chrome (back link + heading) renders immediately. The form area
  // shows a skeleton until the product loads, then swaps in the form.
  // The "no rendered text shifts" rule still holds: the skeleton is
  // animated placeholders; once the form mounts, the back link + heading
  // are unchanged.
  return (
    <div className="space-y-6">
      <Link
        href={detailsHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("editPage.back")}
      </Link>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("editPage.kicker", { label: label.toLowerCase() })}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {product
            ? t("editPage.title", {
                name:
                  resolveTranslation(product.product_translations, uiLocale)
                    ?.name ?? t("list.untitled"),
              })
            : " "}
        </h1>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border border-input bg-muted"
            />
          ))}
        </div>
      )}

      {!isLoading && !product && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("detailsPage.notFound")}
          </CardContent>
        </Card>
      )}

      {!isLoading && product && (
        <ProductFormEdit productType={productType} product={product} />
      )}
    </div>
  );
}
