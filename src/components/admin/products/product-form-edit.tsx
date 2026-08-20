"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import {
  useUpdateProduct,
  type ProductAdminDetailRow,
} from "@/services/products";
import { buildUpdateInput, existingFormState } from "./product-build";
import { ProductFormShell } from "./product-form";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface ProductFormEditProps {
  productType: ProductType;
  product: ProductAdminDetailRow;
}

export function ProductFormEdit({
  productType,
  product,
}: ProductFormEditProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const router = useRouter();
  const c = useTranslations("common");
  const uiLocale = resolveLocale(useLocale());
  const updateProduct = useUpdateProduct(product.id);

  // Seed once per product. The shell owns the live form state from here on;
  // re-running existingFormState on parent re-renders would clobber edits.
  const initial = useMemo(
    () => existingFormState(product, config, uiLocale),
    [product, config, uiLocale],
  );

  const detailsHref = `/admin/${config.routeSlug}/${product.id}`;

  return (
    <ProductFormShell
      productType={productType}
      initialFormState={initial}
      // The catalogue entry the product points at, straight off the same read
      // the form is seeded from — so the image card paints its picture and its
      // label on the first frame, with no extra request.
      initialImage={product.product_images}
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
