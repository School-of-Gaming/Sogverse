"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
 * Shared by the plain list (camps/events, narrowed by search alone) and the club
 * list (search plus the day/educator/language/municipality filters), so the two
 * cannot drift into counting or clearing differently. Renders a fragment rather
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
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{t("filters.showing", { count: products.length, total })}</span>
        {/* No vertical padding: with py-1 the button is taller than the bare
            text, so toggling it in/out grows the row and shifts the cards below.
            Its height now matches the showing-count span's line-height. */}
        {narrowed && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-md px-2 transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" />
            {t("filters.clear")}
          </button>
        )}
      </div>

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
