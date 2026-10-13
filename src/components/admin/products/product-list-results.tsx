"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { AdminListShowingLine } from "@/components/admin/admin-list-narrowing";
import { ProductRows } from "./product-rows";
import type { ProductWithDetails } from "@/services/products";

interface ProductListResultsProps {
  /** The rows left standing after search and filters. */
  products: ProductWithDetails[];
  /** How many of the selected type there are before any filter — the denominator of the count line. */
  total: number;
  /** What the list says when no row is left: none exist yet, or none match. */
  emptyMessage: string;
  /** Whether each row names its type — true while the list mixes the types. */
  showType: boolean;
  /** True while anything — the search box or a filter — is narrowing the list. */
  narrowed: boolean;
  /** Reset every narrowing control, search included. */
  onClear: () => void;
}

/**
 * The tail of the admin product list: how many of how many are showing, a way
 * back to all of them, and either the rows or the reason there are none.
 *
 * Renders a fragment rather than a wrapper: the caller's `space-y` owns the
 * spacing, and a second nesting level here would double it.
 */
export function ProductListResults({
  products,
  total,
  emptyMessage,
  showType,
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
            {emptyMessage}
          </CardContent>
        </Card>
      ) : (
        <ProductRows products={products} showType={showType} />
      )}
    </>
  );
}
