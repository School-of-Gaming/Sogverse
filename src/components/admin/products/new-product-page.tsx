"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useProductAdmin } from "@/services/products";
import { cloneFormState } from "./product-build";
import { ProductTypeInfoCard } from "./product-type-info-card";
import { ProductFormCreate } from "./product-form-create";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface NewProductPageProps {
  productType: ProductType;
  /** When set, the create form opens pre-filled from this product (clone). */
  cloneFrom?: string;
}

export function NewProductPage({
  productType,
  cloneFrom,
}: NewProductPageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());
  const label = t(`types.${config.i18nKey}.label`);
  const plural = t(`types.${config.i18nKey}.plural`);

  const isCloning = !!cloneFrom;

  // Disabled (returns nothing) unless we're cloning. When the admin arrives
  // from a product's detail page the row is already in the React Query cache
  // under the same key, so the form renders populated on first paint — no
  // empty-then-fill flash. A cold deep-link to ?cloneFrom=… shows the skeleton
  // briefly, matching how the edit page behaves.
  const { data: source, isLoading } = useProductAdmin(cloneFrom);

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/${config.routeSlug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("newPage.back", { plural })}
      </Link>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {isCloning
            ? t("clonePage.kicker", { label: label.toLowerCase() })
            : t("newPage.kicker", { label: label.toLowerCase() })}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {!isCloning
            ? t("newPage.title", { label })
            : source
              ? t("clonePage.title", {
                  name:
                    resolveTranslation(
                      source.product_translations,
                      uiLocale,
                    )?.name ?? t("list.untitled"),
                })
              : " "}
        </h1>
      </div>

      <ProductTypeInfoCard productType={productType} />

      {!isCloning && <ProductFormCreate productType={productType} />}

      {isCloning && isLoading && (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border border-input bg-muted"
            />
          ))}
        </div>
      )}

      {isCloning && !isLoading && !source && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("detailsPage.notFound")}
          </CardContent>
        </Card>
      )}

      {isCloning && !isLoading && source && (
        <ProductFormCreate
          productType={productType}
          initialFormState={cloneFormState(
            source,
            config,
            uiLocale,
            t("clonePage.copySuffix"),
          )}
        />
      )}
    </div>
  );
}
