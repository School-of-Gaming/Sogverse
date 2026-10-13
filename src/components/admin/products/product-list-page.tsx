"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NavChevron } from "@/components/ui/nav-chevron";
import { useRoutedUrlParamState } from "@/components/admin/admin-list-url-state";
import {
  PRODUCT_TYPE_ORDER,
  PRODUCT_TYPE_PRESENTATION,
} from "@/components/admin/dashboard/product-type-presentation";
import { useAllProducts } from "@/services/products";
import {
  parseProductListType,
  productListTypeParam,
} from "@/lib/products/admin-product-list-type";
import { ProductListFilters } from "./product-list-filters";
import { PRODUCT_LIST_PARAMS } from "./product-list-url-state";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Every club, camp and event in one list, narrowed by a row of type chips. The
// products tab of its hub, which owns the title above it.
export function ProductListPage() {
  const t = useTranslations("admin.products");
  // Read through the router rather than seeded from `window`: the create
  // button beside the description is painted by the server and names the type.
  const [typeParam, setTypeParam] = useRoutedUrlParamState(
    PRODUCT_LIST_PARAMS.type,
  );
  const type = parseProductListType(typeParam);
  const { data: products, isLoading } = useAllProducts();
  const [choosingType, setChoosingType] = useState(false);

  return (
    <div className="space-y-6">
      {/* The create control is the row's last child under every chip, so it
          ends on the same right edge whichever type is selected. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-muted-foreground">{t("list.subtitle")}</p>
        {type !== null ? (
          <Link href={ROUTES.admin.productNew(type)} className={buttonVariants()}>
            <Plus className="mr-1 h-4 w-4" />
            {t("list.new", {
              label: t(`types.${PRODUCT_TYPE_CONFIG[type].i18nKey}.label`),
            })}
          </Link>
        ) : (
          <Button type="button" onClick={() => setChoosingType(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("list.newAny")}
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-border bg-lifted"
            />
          ))}
        </div>
      )}

      {!isLoading && products && (
        // One `space-y-4` for the type chips, the filter row, the count line
        // and the rows: they are all direct children here (the component below
        // renders a fragment), so they share one rhythm. The chips render only
        // once the products have, so their counts never arrive into them.
        <div className="space-y-4">
          <ProductListFilters
            products={products}
            type={type}
            onTypeChange={(next) =>
              setTypeParam(next === null ? null : productListTypeParam(next))
            }
          />
        </div>
      )}

      <NewProductTypeDialog open={choosingType} onOpenChange={setChoosingType} />
    </div>
  );
}

/**
 * What "New" asks with no type selected: which kind of product to create. Each
 * choice is a link to that type's create form, so picking one is the whole
 * answer and the dialog needs no confirm button of its own.
 */
function NewProductTypeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.products");
  const c = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("list.newDialogTitle")}</DialogTitle>
        </DialogHeader>
        <ul className="mt-4 space-y-2">
          {PRODUCT_TYPE_ORDER.map((productType) => {
            const presentation = PRODUCT_TYPE_PRESENTATION[productType];
            const Icon = presentation.icon;
            return (
              <li key={productType}>
                <Link
                  href={ROUTES.admin.productNew(productType)}
                  className="group flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
                >
                  <Icon
                    className={cn("h-5 w-5 shrink-0", presentation.text)}
                    aria-hidden
                  />
                  <span className="flex-1">
                    {t(`types.${presentation.i18nKey}.label`)}
                  </span>
                  <NavChevron size="sm" />
                </Link>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {c("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
