"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import {
  useUpdateProductV2,
  type ProductV2AdminDetailRow,
} from "@/services/products-v2";
import { buildUpdateInput, existingFormState } from "./product-v2-build";
import { ProductV2FormShell } from "./product-v2-form";
import { PRODUCT_TYPE_CONFIG } from "./product-v2-type-config";
import type { ProductTypeV2 } from "@/types";

interface ProductV2FormEditProps {
  productType: ProductTypeV2;
  product: ProductV2AdminDetailRow;
}

export function ProductV2FormEdit({
  productType,
  product,
}: ProductV2FormEditProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const router = useRouter();
  const c = useTranslations("common");
  const uiLocale = resolveLocale(useLocale());
  const updateProduct = useUpdateProductV2(product.id);

  // Seed once per product. The shell owns the live form state from here on;
  // re-running existingFormState on parent re-renders would clobber edits.
  const initial = useMemo(
    () => existingFormState(product, config, uiLocale),
    [product, config, uiLocale],
  );

  const detailsHref = `/admin/${config.routeSlug}/${product.id}`;

  return (
    <ProductV2FormShell
      productType={productType}
      initialFormState={initial}
      submitLabel={c("saveChanges")}
      onCancel={() => router.push(detailsHref)}
      onSubmit={async (state) => {
        const input = buildUpdateInput(state, config);
        await updateProduct.mutateAsync(input);
        router.push(detailsHref);
      }}
    />
  );
}
