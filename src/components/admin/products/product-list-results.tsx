"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { AdminListShowingLine } from "@/components/admin/admin-list-narrowing";
import { ProductRows } from "./product-rows";
import type { ProductWithDetails } from "@/services/products";
import type { ProductType } from "@/types";

interface ProductListResultsProps {
  /** The rows left standing after search and filters. */
  products: ProductWithDetails[];
  /** How many there were before any of it — the denominator of the count line. */
  total: number;
  productType: ProductType;
  /** The type's plural noun, for the no-matches line. */
  plural: string;
  /** True while anything — the search box or a filter — is narrowing the list. */
  narrowed: boolean;
  /** Reset every narrowing control, search included. */
  onClear: () => void;
}

/**
 * The tail of every admin product list: how many of how many are showing, a way
 * back to all of them, and either the rows or the reason there are none.
 *
 * Rendered by the one filter row all four product types share, so none of them
 * can drift into counting or clearing differently. Renders a fragment rather
 * than a wrapper: the caller's `space-y` owns the spacing, and a second nesting
 * level here would double it.
 */
export function ProductListResults({
  products,
  total,
  productType,
  plural,
  narrowed,
  onClear,
}: ProductListResultsProps) {
  const t = useTranslations("admin.products");

  return (
    <>
      <AdminListShowingLine
        showing={t("filters.showing", { count: products.length, total })}
        clearLabel={t("filters.clear")}
        narrowed={narrowed}
        onClear={onClear}
      />

      {products.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("filters.noMatches", { plural })}
          </CardContent>
        </Card>
      ) : (
        <ProductRows products={products} productType={productType} />
      )}
    </>
  );
}
