"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { useCreateProduct } from "@/services/products";
import { buildCreateInput } from "./product-build";
import { initialState, type FormState } from "./product-form-state";
import { ProductFormShell } from "./product-form";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface ProductFormCreateProps {
  productType: ProductType;
  /**
   * Pre-filled form state, used by the clone flow. When provided it replaces
   * the empty `initialState` so the create form opens already populated.
   */
  initialFormState?: FormState;
}

export function ProductFormCreate({
  productType,
  initialFormState,
}: ProductFormCreateProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const router = useRouter();
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());
  const label = t(`types.${config.i18nKey}.label`);
  const createProduct = useCreateProduct();

  return (
    <ProductFormShell
      productType={productType}
      initialFormState={initialFormState ?? initialState(config, uiLocale)}
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
