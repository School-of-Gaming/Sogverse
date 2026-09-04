"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { useCreateProduct } from "@/services/products";
import { buildCreateInput } from "./product-build";
import { type ProductImageSelection } from "./product-image-selection";
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
  /**
   * The catalogue entry that pre-filled state points at, for the same clone
   * flow. A clone carries the source's picture, so the card has one to paint
   * before the admin has touched anything.
   */
  initialImage?: ProductImageSelection | null;
}

export function ProductFormCreate({
  productType,
  initialFormState,
  initialImage,
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
      initialImage={initialImage}
      isEdit={false}
      submitLabel={t("actions.createLabel", { label: label.toLowerCase() })}
      onCancel={() => router.push(`/admin/${config.routeSlug}`)}
      onSubmit={async (state) => {
        const input = buildCreateInput(state, productType, config);
        const { product_id, warning } = await createProduct.mutateAsync(input);
        // The warning's own copy says to retry from the edit page, and the
        // product that page belongs to has just been created — so continuing
        // goes straight there rather than to the list, where the admin would
        // have to find it again.
        if (warning) {
          return {
            message: warning,
            onContinue: () =>
              router.push(`/admin/${config.routeSlug}/${product_id}/edit`),
          };
        }
        router.push(`/admin/${config.routeSlug}`);
      }}
    />
  );
}
