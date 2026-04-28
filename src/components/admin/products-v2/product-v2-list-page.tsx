"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Calendar, Users, Clock, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProductsV2ByType } from "@/services/products-v2";
import { productImageUrl } from "@/lib/images/product-image-url";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { formatDate } from "@/lib/utils";
import { effectiveStatus } from "./effective-status";
import { ProductTypeInfoCard } from "./product-type-info-card";
import { PRODUCT_TYPE_CONFIG } from "./product-v2-type-config";
import type { ProductV2 } from "@/types";
import type { ProductTypeV2 } from "@/types";

interface ProductV2ListPageProps {
  productType: ProductTypeV2;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-primary/20 text-primary",
  running: "bg-primary text-primary-foreground",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/20 text-destructive",
};

// What's blocking a derived-pending product from going live? Caller has
// already verified the effective status is `pending`. Without current
// enrollment counts in the list query, threshold messages describe the
// rule ("starts when N sign up") rather than progress ("3 of 10").
function pendingHint(
  p: Pick<
    ProductV2,
    "start_date" | "signup_threshold" | "registration_opens_at"
  >,
  locale: string,
  t: (
    key:
      | "list.pendingHint.registrationOpens"
      | "list.pendingHint.startDate"
      | "list.pendingHint.threshold"
      | "list.pendingHint.dateAndThreshold"
      | "list.pendingHint.pastDateThreshold",
    values?: Record<string, string | number>
  ) => string
): string | null {
  const now = Date.now();

  if (
    p.registration_opens_at &&
    new Date(p.registration_opens_at).getTime() > now
  ) {
    return t("list.pendingHint.registrationOpens", {
      date: formatDate(p.registration_opens_at, locale),
    });
  }

  const startInFuture =
    p.start_date !== null && new Date(p.start_date).getTime() > now;
  const startInPast =
    p.start_date !== null && new Date(p.start_date).getTime() <= now;

  if (startInFuture && p.signup_threshold) {
    return t("list.pendingHint.dateAndThreshold", {
      date: formatDate(p.start_date!, locale),
      count: p.signup_threshold,
    });
  }
  if (startInFuture) {
    return t("list.pendingHint.startDate", {
      date: formatDate(p.start_date!, locale),
    });
  }
  // Date passed but threshold isn't met — common after a launch window.
  if (startInPast && p.signup_threshold) {
    return t("list.pendingHint.pastDateThreshold", {
      count: p.signup_threshold,
    });
  }
  if (p.signup_threshold) {
    return t("list.pendingHint.threshold", { count: p.signup_threshold });
  }
  return null;
}

export function ProductV2ListPage({ productType }: ProductV2ListPageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.productsV2");
  const uiLocale = resolveLocale(useLocale());
  const label = t(`types.${config.i18nKey}.label`);
  const plural = t(`types.${config.i18nKey}.plural`);
  const { data: products, isLoading } = useProductsV2ByType(productType);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{plural}</h1>
          <p className="text-muted-foreground">
            {t("list.subtitle", { plural })}
          </p>
        </div>
        <Link href={`/admin/${config.routeSlug}/new`}>
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            {t("list.new", { label })}
          </Button>
        </Link>
      </div>

      <ProductTypeInfoCard productType={productType} />

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
        <div className="space-y-2">
          {products.map((p) => {
            const thumbnailUrl = p.image_path
              ? productImageUrl(p.image_path)
              : null;
            const tr = resolveTranslation(p.product_translations_v2, uiLocale);
            // TODO: thread real active-participation count when participations_v2
            // ships. Until then threshold-bearing products read as pending.
            const status = effectiveStatus(p, new Date(), 0);
            const hint =
              status === "pending" ? pendingHint(p, uiLocale, t) : null;
            return (
              <Card key={p.id}>
                <CardContent className="flex items-center gap-4 py-3">
                  <div className="relative h-14 w-14 overflow-hidden rounded-md border bg-muted">
                    {thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin list only; next/image unoptimized not worth the ceremony here
                      <img
                        src={thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {tr?.name ?? t("list.untitled")}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          STATUS_STYLE[status] ?? STATUS_STYLE.draft
                        }`}
                      >
                        {t(`status.${status}`)}
                      </span>
                      {!p.is_visible && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {t("list.hidden")}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {tr?.description ?? ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {t("list.ageRange", {
                          min: p.min_age,
                          max: p.max_age,
                        })}
                      </span>
                      {p.start_date && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {p.start_date}
                          {p.end_date && p.end_date !== p.start_date
                            ? ` → ${p.end_date}`
                            : ""}
                        </span>
                      )}
                      {p.seat_count !== null && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t("list.seats", { count: p.seat_count })}
                        </span>
                      )}
                      {hint && (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Hourglass className="h-3 w-3" />
                          {hint}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
