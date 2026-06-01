"use client";

import { useLocale, useTranslations } from "next-intl";
import { decimalToCents, formatCurrencyFromCents } from "@/lib/utils";
import {
  BUNDLE_DISCOUNTS,
  BUNDLE_SIZES,
  SUBSCRIPTION_DISCOUNTS,
  SUBSCRIPTION_FREQUENCIES,
  computeBundleCents,
  computeSubscriptionCents,
  type SupportedCurrency,
} from "@/lib/constants";

const EMPTY = "—";

/** One row of the preview: left-aligned label, right-aligned price. */
function PriceRow({ label, price }: { label: string; price: string }) {
  return (
    <li className="grid grid-cols-[1fr_auto] items-baseline gap-4">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{price}</span>
    </li>
  );
}

interface PricePreviewProps {
  value: string;
  currency: SupportedCurrency;
}

export function BundlePricePreview({ value, currency }: PricePreviewProps) {
  const t = useTranslations("admin.products.pricing");
  const locale = useLocale();
  const cents = decimalToCents(value);

  return (
    <div className="rounded-md bg-muted/40 p-2 text-xs">
      <div className="mb-1 font-medium text-muted-foreground">
        {t("bundleHeading")}
      </div>
      <ul className="space-y-0.5">
        {BUNDLE_SIZES.map((size) => {
          const discount = BUNDLE_DISCOUNTS[size] ?? 0;
          const price =
            cents !== null
              ? formatCurrencyFromCents(
                  computeBundleCents(cents, size),
                  currency,
                  locale
                )
              : EMPTY;
          const label =
            size === 1
              ? t("bundleSingle")
              : t("bundleMulti", {
                  size,
                  discount: Math.round(discount * 100),
                });
          return <PriceRow key={size} label={label} price={price} />;
        })}
      </ul>
    </div>
  );
}

export function SubscriptionPricePreview({
  value,
  currency,
}: PricePreviewProps) {
  const t = useTranslations("admin.products.pricing");
  const locale = useLocale();
  const cents = decimalToCents(value);

  return (
    <div className="rounded-md bg-muted/40 p-2 text-xs">
      <div className="mb-1 font-medium text-muted-foreground">
        {t("subHeading")}
      </div>
      <ul className="space-y-0.5">
        {SUBSCRIPTION_FREQUENCIES.map((freq) => {
          const discount = SUBSCRIPTION_DISCOUNTS[freq];
          const discountPct = Math.round(discount * 100);
          const price =
            cents !== null
              ? formatCurrencyFromCents(
                  computeSubscriptionCents(cents, freq),
                  currency,
                  locale
                )
              : EMPTY;
          const label =
            freq === "monthly"
              ? t("subMonthly")
              : freq === "quarterly"
                ? t("subQuarterly", { discount: discountPct })
                : t("subYearly", { discount: discountPct });
          return <PriceRow key={freq} label={label} price={price} />;
        })}
      </ul>
    </div>
  );
}
