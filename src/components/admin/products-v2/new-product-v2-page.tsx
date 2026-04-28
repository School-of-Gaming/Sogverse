"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { ProductTypeInfoCard } from "./product-type-info-card";
import { ProductV2Form } from "./product-v2-form";
import { PRODUCT_TYPE_CONFIG } from "./product-v2-type-config";
import type { ProductTypeV2 } from "@/types";

interface NewProductV2PageProps {
  productType: ProductTypeV2;
}

export function NewProductV2Page({ productType }: NewProductV2PageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.productsV2");
  const label = t(`types.${config.i18nKey}.label`);
  const plural = t(`types.${config.i18nKey}.plural`);

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
          {t("newPage.kicker", { label: label.toLowerCase() })}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {t("newPage.title", { label })}
        </h1>
      </div>

      <ProductTypeInfoCard productType={productType} />

      <ProductV2Form productType={productType} />
    </div>
  );
}
