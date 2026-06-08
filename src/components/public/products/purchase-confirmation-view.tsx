"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { formatCurrencyFromCents } from "@/lib/utils";
import { CURRENCY_CONFIG, DEFAULT_CURRENCY } from "@/lib/constants/currency";
import type { ProductBrowseRow } from "@/types";
import { buildPricingOption, type PricingOption } from "./pricing-options";
import { ProductWhenWhereCard } from "./product-when-where-card";

// Purchase confirmation — data-only presentational view (no fetching). A
// non-tech-savvy parent has just paid (or signed up for a free event) and
// lands here. We reassure them it worked and lay out exactly what they bought,
// who for, and what happens next. The page server-fetches the participation +
// product and hands them here, so it paints complete on first load: no client
// loading state, no skeleton, no layout shift.

interface PurchaseConfirmationViewProps {
  product: ProductBrowseRow;
  /** Gamer's first name (or username fallback); null → "Your child". */
  gamerName: string | null;
}

export function PurchaseConfirmationView({
  product,
  gamerName,
}: PurchaseConfirmationViewProps) {
  const t = useTranslations("purchaseConfirmation");
  const tProduct = useTranslations("productDetail");
  const locale = resolveLocale(useLocale());

  const tr = resolveTranslation(product.product_translations, locale);
  const productName = tr?.name ?? "";
  const gamer = gamerName ?? t("fallbackGamer");

  // Price is recomputed from the product's *current* prices, not stored as a
  // receipt of what was charged. For the fresh post-checkout view that's
  // correct. Honest caveat: the page is RLS-revisitable (no consumed flag), so
  // if an admin later changes the product's price, a parent reopening an old
  // confirmation link sees the new price on a summary captioned as their order.
  // Accepted — this is a "what you signed up for" confirmation, not a billing
  // receipt; the authoritative record lives in Stripe / My SOG.
  const pricingOption = buildPricingOption({
    prices: product.product_prices,
    billingMode: product.billing_mode,
    productType: product.product_type,
    currency: DEFAULT_CURRENCY,
    currencyLabel: CURRENCY_CONFIG[DEFAULT_CURRENCY].label,
  });
  const price = priceText(pricingOption, locale, t);

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            {t("heading")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t(`subheading.${product.product_type}`, {
              gamer,
              product: productName,
            })}
          </p>
        </div>

        <Card className="mt-8">
          <CardContent className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("summaryTitle")}
            </h2>
            <div className="mt-4 flex items-start gap-4">
              <ProductThumbnail
                imagePath={product.image_path ?? ""}
                alt={productName}
                size="h-16 w-16"
                className="shrink-0 rounded-lg [&>img]:h-full [&>img]:w-full [&>img]:rounded-lg [&>img]:object-cover"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {tProduct(`typeLabel.${product.product_type}`)}
                </p>
                <p className="mt-0.5 font-semibold">{productName}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <SummaryRow
                label={t(`forLabel.${product.product_type}`)}
                value={gamer}
              />
              {price && <SummaryRow label={t("priceLabel")} value={price} />}
            </dl>
          </CardContent>
        </Card>

        <div className="mt-6">
          <ProductWhenWhereCard product={product} />
        </div>

        <Card className="mt-6">
          <CardContent className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("nextTitle")}
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>{t("next.placement", { gamer })}</li>
              {pricingOption.kind === "subscription" && (
                <li>{t("next.subscription")}</li>
              )}
              {pricingOption.kind === "upfront" && <li>{t("next.oneTime")}</li>}
              {pricingOption.kind === "upfront" &&
                product.refund_policy_days != null &&
                product.refund_policy_days > 0 && (
                  <li>
                    {t("next.refund", { days: product.refund_policy_days })}
                  </li>
                )}
            </ul>
          </CardContent>
        </Card>

        {/* My SOG is the primary action (right on desktop, top on mobile via
            flex-col-reverse); Keep browsing is the secondary, on the left. */}
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <Link
            href={ROUTES.shop}
            className={buttonVariants({
              variant: "outline",
              className: "sm:min-w-[180px]",
            })}
          >
            {t("keepBrowsing")}
          </Link>
          <Link
            href={ROUTES.customer.dashboard}
            className={buttonVariants({ className: "sm:min-w-[180px]" })}
          >
            {t("goToDashboard")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

// The price line for the summary. Subscriptions read "€X / month", one-time
// camps/events read "€X (one-time)". External (municipality) and unavailable
// shapes never reach a paid confirmation, so they show no price line.
function priceText(
  option: PricingOption,
  locale: string,
  t: ReturnType<typeof useTranslations<"purchaseConfirmation">>,
): string | null {
  switch (option.kind) {
    case "subscription":
      return t("price.subscription", {
        amount: formatCurrencyFromCents(
          option.totalCents,
          DEFAULT_CURRENCY,
          locale,
        ),
      });
    case "upfront":
      return t("price.upfront", {
        amount: formatCurrencyFromCents(
          option.totalCents,
          DEFAULT_CURRENCY,
          locale,
        ),
      });
    case "free":
      return t("price.free");
    case "external":
    case "unavailable":
      return null;
  }
}

// Direct-link / stale-link case (no id, RLS miss, or load error). Kept
// deliberately minimal — a real purchaser never sees this; we only need to not
// crash and to offer a way onward.
export function PurchaseConfirmationFallback() {
  const t = useTranslations("purchaseConfirmation");
  return (
    <div className="container mx-auto px-4 py-12">
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className="text-lg font-semibold">{t("notFound.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("notFound.description")}
          </p>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row">
            <Link
              href={ROUTES.shop}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("keepBrowsing")}
            </Link>
            <Link href={ROUTES.customer.dashboard} className={buttonVariants()}>
              {t("notFound.cta")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
