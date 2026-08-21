"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveLocale } from "@/lib/constants/locales";
import { cn } from "@/lib/utils";
import { PRODUCT_TYPE_ORDER, PRODUCT_TYPE_PRESENTATION } from "@/components/admin/dashboard/product-type-presentation";
import { PRODUCT_TYPE_CONFIG } from "../product-type-config";
import { AdminProductFilterBar } from "./admin-product-filter-bar";
import { AdminProductTable } from "./admin-product-table";
import {
  EMPTY_PRODUCT_FILTERS,
  filterProductRows,
  sortProductRows,
  type AdminProductListFilters,
  type AdminProductListRow,
  type ProductSortKey,
  type SortDirection,
} from "./admin-product-list-data";

/**
 * The **draft** admin product list: one catalogue for all four product types.
 *
 * The live list is four pages — `/admin/consumer-clubs`, `/admin/camps` and so
 * on — which makes a product's *type* a navigation axis. It is not one. An admin
 * looking for "the Espoo club that has no educator" does not first decide
 * whether it is a consumer club or a municipality club; they know the name, or
 * the town, or that something is wrong with it. Type is an attribute, so here it
 * is a tinted glyph in the first column and a filter chip above the table, and
 * every product in the platform is in one list.
 *
 * **What was dropped from the row, and why.** Short description, age range,
 * language, topic and audience are all gone. Each is either a *filter* (language)
 * or a fact you read on the product's own page (the rest); none of them is a
 * thing anybody compares across thirty rows, and together they were what forced
 * the row to be a three-line block instead of a line.
 *
 * **The default order is work first** — running, then pending by start date,
 * then everything finished — because the reason to open this page is almost
 * always something that is still going on. Sorting by a column replaces that
 * order outright rather than refining it; a "sort within status" would be a
 * grouping nobody asked for and would make the seats column, sorted, not
 * actually sorted by seats.
 *
 * Presentational end to end: rows arrive resolved, every link points at the real
 * admin route, and nothing here queries or mutates. Filter and sort state is
 * local, which is what lets a preview scene render the identical body.
 */
export function AdminProductListPageBody({
  rows,
  filters,
  onFiltersChange,
}: {
  /** The whole catalogue, already resolved. Order here does not matter. */
  rows: readonly AdminProductListRow[];
  /**
   * The current filter state, owned by the caller.
   *
   * A prop rather than this component's own state because the live page mirrors
   * it into the URL query string — so that Back restores the list a reader had
   * narrowed rather than dropping them at the top of two hundred rows. Which
   * mechanism does the mirroring is the shell's business; the body only needs
   * the value and a way to ask for a new one.
   */
  filters: AdminProductListFilters;
  onFiltersChange: (next: AdminProductListFilters) => void;
}) {
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());

  const [sortKey, setSortKey] = useState<ProductSortKey>("default");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const visible = useMemo(() => {
    const narrowed = filterProductRows(rows, filters);
    return sortProductRows(narrowed, sortKey, sortDirection, uiLocale);
  }, [rows, filters, sortKey, sortDirection, uiLocale]);

  /**
   * Clicking a column: take it if it is not the current one, otherwise flip the
   * direction. A third click does **not** return to the default order — an
   * order that disappears on a click nobody meant to make is worse than one that
   * stays until it is replaced.
   */
  const handleSort = (key: ProductSortKey) => {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  return (
    // Reserve the document scrollbar gutter: filtering can flip the page between
    // fits-the-viewport and needs-a-scrollbar, and the whole table would shift
    // sideways as it did — see the html:has() rule in globals.css.
    <div className="space-y-6" data-reserve-scroll-gutter>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("catalogue.title")}</h1>
          <p className="text-muted-foreground">{t("catalogue.subtitle")}</p>
        </div>
        {/* Four New buttons rather than one, because creating a product means
            choosing its type first and the four forms are genuinely different.
            They carry the same tinted glyph the rows do, so the choice is made
            in the same vocabulary the list is read in. */}
        <div className="flex flex-wrap items-center gap-2">
          {PRODUCT_TYPE_ORDER.map((type) => {
            const presentation = PRODUCT_TYPE_PRESENTATION[type];
            const Icon = presentation.icon;
            return (
              <Link
                key={type}
                href={`/admin/${PRODUCT_TYPE_CONFIG[type].routeSlug}/new`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Plus aria-hidden className="mr-1 h-4 w-4" />
                <Icon aria-hidden className={cn("mr-1 h-4 w-4", presentation.text)} />
                {t(`types.${presentation.i18nKey}.label`)}
              </Link>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-12 text-center">
            <p className="font-medium">{t("catalogue.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("catalogue.emptyDescription")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <AdminProductFilterBar
            rows={rows}
            filters={filters}
            onChange={onFiltersChange}
            onClear={() => onFiltersChange(EMPTY_PRODUCT_FILTERS)}
            shownCount={visible.length}
          />

          {visible.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t("catalogue.noMatches")}
              </CardContent>
            </Card>
          ) : (
            <AdminProductTable
              rows={visible}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          )}
        </>
      )}
    </div>
  );
}
