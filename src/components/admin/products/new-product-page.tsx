"use client";

import { Link } from "@/i18n/navigation";
import { Heading } from "@sog/ui";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { useHolidayCalendarListWait } from "@/components/admin/holiday-calendars/holiday-calendar-picker";
import { Card, CardContent } from "@/components/ui/card";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveRequiredTranslation } from "@/lib/i18n/resolve-translation";
import { useProductAdmin } from "@/services/products/products.queries";
import { cloneFormState } from "./product-build";
import { ProductFormCreate } from "./product-form-create";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";
import { ROUTES } from "@/lib/constants/routes";

interface NewProductPageProps {
  productType: ProductType;
  /** When set, the create form opens pre-filled from this product (clone). */
  cloneFrom?: string;
}

export function NewProductPage({
  productType,
  cloneFrom,
}: NewProductPageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.products");
  const uiLocale = resolveLocale(useLocale());
  const type = config.i18nKey;

  const isCloning = !!cloneFrom;

  // Disabled (returns nothing) unless we're cloning. When the admin arrives
  // from a product's detail page the row is already in the React Query cache
  // under the same key, so the form renders populated on first paint — no
  // empty-then-fill flash. A cold deep-link to ?cloneFrom=… shows the skeleton
  // briefly, matching how the edit page behaves.
  const { data: source, isLoading: sourceLoading } = useProductAdmin(cloneFrom);
  // A club's form also waits for the holiday calendar list, so the picker
  // paints with the rest of the form instead of pushing it down on arrival.
  const calendarsPending = useHolidayCalendarListWait(
    config.followsHolidayCalendars,
  );
  const isLoading = (isCloning && sourceLoading) || calendarsPending;

  return (
    <div className="space-y-6">
      <Link
        href={ROUTES.admin.productList(productType)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("newPage.back", { type })}
      </Link>

      <div>
        {/* Eyebrow only on the clone page, where it carries distinct info
            ("Clone {type}") above a title that's the source product's name.
            The new page's title already reads "New {type}", so an eyebrow
            here would just repeat it. */}
        {isCloning && (
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("clonePage.kicker", { type })}
          </p>
        )}
        <div className={isCloning ? "mt-1" : undefined}>
          <Heading level={1} step="section">
            {!isCloning
              ? t("newPage.title", { type })
              : source
                ? t("clonePage.title", {
                    name: resolveRequiredTranslation(
                      source.product_translations,
                      uiLocale,
                    ).name,
                  })
                : " "}
          </Heading>
        </div>
      </div>

      {!isCloning && !isLoading && (
        <ProductFormCreate productType={productType} />
      )}

      {isLoading && (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border border-border bg-lifted"
            />
          ))}
        </div>
      )}

      {isCloning && !isLoading && !source && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("detailsPage.notFound")}
          </CardContent>
        </Card>
      )}

      {isCloning && !isLoading && source && (
        <ProductFormCreate
          productType={productType}
          initialFormState={cloneFormState(
            source,
            config,
            uiLocale,
            t("clonePage.copySuffix"),
          )}
          // A clone carries the source's catalogue entry, so it carries the
          // entry's label and picture too.
          initialImage={source.catalogue_images}
        />
      )}
    </div>
  );
}
