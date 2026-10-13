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
  parseAdminProductSlug,
  adminProductSlug,
} from "@/lib/products/admin-product-list-type";
import { ProductListFilters } from "./product-list-filters";
import { PRODUCT_LIST_PARAMS } from "./product-list-url-state";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * The list's `type` param, read through the router rather than seeded from
 * `window`: the create button the hub draws beside the description is painted
 * by the server and names the type.
 */
function useProductListType() {
  const [typeParam, setTypeParam] = useRoutedUrlParamState(
    PRODUCT_LIST_PARAMS.type,
  );
  return [parseAdminProductSlug(typeParam), setTypeParam] as const;
}

// Every club, camp and event in one list, narrowed by a row of type chips. The
// products tab of its hub, which owns the title and the description above it.
export function ProductListPage() {
  const [type, setTypeParam] = useProductListType();
  const { data: products, isLoading } = useAllProducts();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-border bg-lifted"
          />
        ))}
      </div>
    );
  }

  if (!products) return null;

  return (
    // One `space-y-4` for the type chips, the filter row, the count line and
    // the rows: they are all direct children here (the component below renders
    // a fragment), so they share one rhythm. The chips render only once the
    // products have, so their counts never arrive into them.
    <div className="space-y-4">
      <ProductListFilters
        products={products}
        type={type}
        onTypeChange={(next) =>
          setTypeParam(next === null ? null : adminProductSlug(next))
        }
      />
    </div>
  );
}

/**
 * The list's create control, the hub's `action`: the selected type's create
 * form, or — under every type — a dialog asking which kind to create. Either
 * way it is the description line's last child, so it ends on the same right
 * edge whichever type is selected.
 */
export function ProductListCreateAction() {
  const t = useTranslations("admin.products");
  const [type] = useProductListType();
  const [choosingType, setChoosingType] = useState(false);

  if (type !== null) {
    return (
      <Link href={ROUTES.admin.productNew(type)} className={buttonVariants()}>
        <Plus className="mr-1 h-4 w-4" />
        {t("list.new", { type: PRODUCT_TYPE_CONFIG[type].i18nKey })}
      </Link>
    );
  }

  return (
    <>
      <Button type="button" onClick={() => setChoosingType(true)}>
        <Plus className="mr-1 h-4 w-4" />
        {t("list.newAny")}
      </Button>
      <NewProductTypeDialog open={choosingType} onOpenChange={setChoosingType} />
    </>
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
