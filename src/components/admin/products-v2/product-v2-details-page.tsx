"use client";

import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SUPPORTED_CURRENCIES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { productImageUrl } from "@/lib/images/product-image-url";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { DAYS_OF_WEEK, formatDate } from "@/lib/utils";
import { useProductV2Admin } from "@/services/products-v2";
import { effectiveStatus } from "./effective-status";
import { FormSection } from "./form-primitives";
import { PRODUCT_TYPE_CONFIG } from "./product-v2-type-config";
import type { ProductTypeV2 } from "@/types";

interface ProductV2DetailsPageProps {
  productType: ProductTypeV2;
  productId: string;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-primary/20 text-primary",
  running: "bg-primary text-primary-foreground",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/20 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

export function ProductV2DetailsPage({
  productType,
  productId,
}: ProductV2DetailsPageProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.productsV2");
  const c = useTranslations("common");
  const uiLocale = resolveLocale(useLocale());
  const label = t(`types.${config.i18nKey}.label`);
  const plural = t(`types.${config.i18nKey}.plural`);

  const { data: product, isLoading } = useProductV2Admin(productId);

  const listHref = `/admin/${config.routeSlug}`;
  const editHref = `/admin/${config.routeSlug}/${productId}/edit`;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Link
          href={listHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("newPage.back", { plural })}
        </Link>
        <div className="h-40 animate-pulse rounded-lg border border-input bg-muted" />
        <div className="h-24 animate-pulse rounded-lg border border-input bg-muted" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-6">
        <Link
          href={listHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("newPage.back", { plural })}
        </Link>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("detailsPage.notFound")}
          </CardContent>
        </Card>
      </div>
    );
  }

  const tr = resolveTranslation(product.product_translations_v2, uiLocale);
  const topicTr = resolveTranslation(
    product.topics_v2?.topic_translations_v2 ?? [],
    uiLocale,
  );
  const status = effectiveStatus(product, new Date(), 0);
  const imageUrl = product.image_path
    ? productImageUrl(product.image_path)
    : null;

  // Tag chips, locale-resolved.
  const tags = product.product_tags_v2
    .map((pt) => {
      if (!pt.tags_v2) return null;
      const ttr = resolveTranslation(pt.tags_v2.tag_translations_v2, uiLocale);
      return ttr?.name ?? pt.tags_v2.slug;
    })
    .filter((n): n is string => n !== null);

  // Location string.
  const locationLabel = (() => {
    if (product.is_remote) {
      return product.locations
        ? t("detailsPage.onlineWithin", { name: product.locations.name })
        : t("detailsPage.online");
    }
    if (!product.locations) return t("detailsPage.locationMissing");
    return product.locations.parent
      ? `${product.locations.name}, ${product.locations.parent.name}`
      : product.locations.name;
  })();

  // Locales available for the name+description block.
  const availableLocales = product.product_translations_v2
    .map((t) => t.locale)
    .join(", ");

  return (
    <div className="space-y-6">
      <Link
        href={listHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("newPage.back", { plural })}
      </Link>

      {/* Header strip */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-md border bg-muted">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              {tr?.name ?? t("list.untitled")}
            </h1>
            {tr?.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {tr.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  STATUS_STYLE[status] ?? STATUS_STYLE.draft
                }`}
              >
                {t(`status.${status}`)}
              </span>
              {!product.is_visible && status !== "draft" && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t("list.hidden")}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0">
            <Link href={editHref}>
              <Button>
                <Pencil className="mr-1 h-4 w-4" />
                {c("edit")}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Identity */}
      <FormSection title={t("sections.identity")}>
        <DlRow label={t("detailsPage.fields.topic")}>
          {topicTr?.name ??
            product.topics_v2?.slug ??
            t("detailsPage.locationMissing")}
        </DlRow>
        {tags.length > 0 && (
          <DlRow label={t("detailsPage.fields.tags")}>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((name) => (
                <span
                  key={name}
                  className="rounded-full border px-2 py-0.5 text-xs"
                >
                  {name}
                </span>
              ))}
            </div>
          </DlRow>
        )}
        {product.padlet_url && (
          <DlRow label={t("detailsPage.fields.padletUrl")}>
            <a
              href={product.padlet_url}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              {product.padlet_url}
            </a>
          </DlRow>
        )}
        <DlRow label={t("detailsPage.fields.locales")}>
          {availableLocales || t("detailsPage.locationMissing")}
        </DlRow>
      </FormSection>

      {/* Audience */}
      <FormSection title={t("sections.audience")}>
        <DlRow label={t("detailsPage.fields.ageRange")}>
          {t("list.ageRange", { min: product.min_age, max: product.max_age })}
        </DlRow>
        <DlRow label={t("detailsPage.fields.spokenLanguage")}>
          {product.spoken_language_code}
        </DlRow>
      </FormSection>

      {/* Where */}
      <FormSection title={t("sections.where")}>
        <DlRow label={t("detailsPage.fields.location")}>{locationLabel}</DlRow>
      </FormSection>

      {/* When */}
      <FormSection title={t("sections.when")}>
        {product.start_date && (
          <DlRow label={t("detailsPage.fields.startDate")}>
            {formatDate(product.start_date, uiLocale)}
          </DlRow>
        )}
        {product.end_date && product.end_date !== product.start_date && (
          <DlRow label={t("detailsPage.fields.endDate")}>
            {formatDate(product.end_date, uiLocale)}
          </DlRow>
        )}
        {product.signup_threshold !== null && (
          <DlRow label={t("detailsPage.fields.signupThreshold")}>
            {product.signup_threshold}
          </DlRow>
        )}
        {product.schedule_slots_v2.length > 0 && (
          <DlRow label={t("detailsPage.fields.schedule")}>
            <ul className="space-y-0.5">
              {product.schedule_slots_v2.map((s, i) => (
                <li key={i} className="text-sm">
                  {t("detailsPage.scheduleRow", {
                    day: DAYS_OF_WEEK[s.weekday],
                    time: s.start_time.slice(0, 5),
                    duration: s.duration_minutes,
                  })}
                </li>
              ))}
            </ul>
          </DlRow>
        )}
        {product.product_holiday_calendars_v2.length > 0 && (
          <DlRow label={t("detailsPage.fields.holidayCalendars")}>
            {product.product_holiday_calendars_v2
              .map((h) => h.holiday_calendars_v2?.name)
              .filter((n): n is string => !!n)
              .join(", ")}
          </DlRow>
        )}
      </FormSection>

      {/* Billing */}
      <FormSection title={t("sections.billing")}>
        <DlRow label={t("detailsPage.fields.billingMode")}>
          {t(`detailsPage.billingMode.${product.billing_mode}`)}
        </DlRow>
        <DlRow label={t("detailsPage.fields.seats")}>
          {product.seat_count !== null
            ? t("list.seats", { count: product.seat_count })
            : t("detailsPage.uncapped")}
        </DlRow>
        <DlRow label={t("detailsPage.fields.waitlist")}>
          {product.waitlist_enabled ? c("on") : c("off")}
        </DlRow>
        {product.product_prices_v2.length > 0 && (
          <DlRow label={t("detailsPage.fields.prices")}>
            <ul className="space-y-0.5 text-sm">
              {SUPPORTED_CURRENCIES.map((cur) => {
                const row = product.product_prices_v2.find(
                  (p) => p.currency === cur,
                );
                if (!row) return null;
                return (
                  <li key={cur}>
                    {cur.toUpperCase()}:{" "}
                    {(row.price_per_session / 100).toFixed(2)}
                    {row.price_per_month > 0 &&
                      ` · ${t("detailsPage.perMonth", {
                        amount: (row.price_per_month / 100).toFixed(2),
                      })}`}
                  </li>
                );
              })}
            </ul>
          </DlRow>
        )}
      </FormSection>

      {/* Registration */}
      <FormSection title={t("sections.registration")}>
        <DlRow label={t("detailsPage.fields.registrationOpensAt")}>
          {formatDate(product.registration_opens_at, uiLocale, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </DlRow>
        <DlRow label={t("detailsPage.fields.visibility")}>
          {product.is_visible
            ? t("detailsPage.visible")
            : t("detailsPage.hidden")}
        </DlRow>
      </FormSection>
    </div>
  );
}

function DlRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[160px_1fr] sm:gap-3">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
