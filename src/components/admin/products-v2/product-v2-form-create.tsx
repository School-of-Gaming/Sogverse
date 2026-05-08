"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { useCreateProductV2 } from "@/services/products-v2";
import { buildCreateInput } from "./product-v2-build";
import { initialState } from "./product-v2-form-state";
import { ProductV2FormShell } from "./product-v2-form";
import { PRODUCT_TYPE_CONFIG } from "./product-v2-type-config";
import type { ProductTypeV2 } from "@/types";

interface ProductV2FormCreateProps {
  productType: ProductTypeV2;
}

export function ProductV2FormCreate({ productType }: ProductV2FormCreateProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const router = useRouter();
  const t = useTranslations("admin.productsV2");
  const uiLocale = resolveLocale(useLocale());
  const label = t(`types.${config.i18nKey}.label`);
  const createProduct = useCreateProductV2();

  return (
    <ProductV2FormShell
      productType={productType}
      initialFormState={initialState(config, uiLocale)}
      submitLabel={t("actions.createLabel", { label: label.toLowerCase() })}
      onCancel={() => router.push(`/admin/${config.routeSlug}`)}
      onSubmit={async (state) => {
        const input = buildCreateInput(state, productType, config);
        await createProduct.mutateAsync(input);
        router.push(`/admin/${config.routeSlug}`);
      }}
    />
  );
}
