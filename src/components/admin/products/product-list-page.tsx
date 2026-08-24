"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useProductsByType } from "@/services/products";
import { ClubProductFilters } from "./club-product-filters";
import { filterProductsBySearch } from "./product-name-search";
import { ProductListResults } from "./product-list-results";
import {
  PRODUCT_LIST_PARAMS,
  useDebouncedUrlParamState,
} from "./product-list-url-state";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface ProductListPageProps {
  productType: ProductType;
}

export function ProductListPage({ productType }: ProductListPageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.products");
  const label = t(`types.${config.i18nKey}.label`);
  const plural = t(`types.${config.i18nKey}.plural`);
  const { data: products, isLoading } = useProductsByType(productType);

  // The search box is owned here rather than by the club filter bar because it
  // is the one narrowing control all four types get. Clubs AND it with their
  // own filters (the bar takes it as a prop); camps and events narrow by it
  // alone. The value is local and the list narrows on it per keystroke; the URL
  // is mirrored a moment behind so Back restores it — see the hook.
  const [search, setSearch, flushSearch] = useDebouncedUrlParamState(
    PRODUCT_LIST_PARAMS.search,
  );

  // One gesture with one value, so the URL takes it immediately rather than
  // waiting out a delay meant for typing.
  const clearSearch = () => {
    setSearch("");
    flushSearch();
  };

  // Clubs get the day / educator / language|municipality filter bar; camps and
  // events render the plain list.
  const isClubType =
    productType === "consumer_club" || productType === "municipality_club";

  // The camps/events list, narrowed by the search alone. Not computed for the
  // club types: the bar below does its own pass so it can AND the search with
  // the day/educator/language/municipality filters in one filter.
  const matched =
    !isClubType && products ? filterProductsBySearch(products, search) : [];

  return (
    // Reserve the document scrollbar gutter: the list (and, for clubs, the
    // filters) can flip the page between fits-the-viewport and needs-a-scrollbar
    // as data loads or filters narrow it — see html:has() rule in globals.css.
    <div className="space-y-6" data-reserve-scroll-gutter>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{plural}</h1>
          <p className="text-muted-foreground">
            {t("list.subtitle", { plural })}
          </p>
        </div>
        <Link
          href={`/admin/${config.routeSlug}/new`}
          className={buttonVariants()}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("list.new", { label })}
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-input bg-muted"
            />
          ))}
        </div>
      )}

      {!isLoading && products && products.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("list.empty", { plural, label })}
          </CardContent>
        </Card>
      )}

      {!isLoading && products && products.length > 0 && (
        // One `space-y-4` for every narrowing control and the list under them,
        // whichever type this is: the search field, the club bar's filter grid,
        // the count line and the rows are all direct children here (the two
        // components below render fragments), so the rhythm is identical across
        // the four pages.
        <div className="space-y-4">
          <div className="relative sm:max-w-sm">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              // Leaving the field settles the URL at once, so a click straight
              // from the box into a product row cannot outrun the mirror.
              onBlur={flushSearch}
              placeholder={t("filters.searchPlaceholder")}
              aria-label={t("filters.search")}
              className="pl-9"
            />
          </div>

          {isClubType ? (
            <ClubProductFilters
              productType={productType}
              products={products}
              search={search}
              onClearSearch={clearSearch}
            />
          ) : (
            <ProductListResults
              products={matched}
              total={products.length}
              productType={productType}
              plural={plural}
              narrowed={search.trim() !== ""}
              onClear={clearSearch}
            />
          )}
        </div>
      )}
    </div>
  );
}
