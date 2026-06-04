"use client";

import { useTranslations } from "next-intl";
import { formatCurrencyFromCents } from "@/lib/utils";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { PricingOption } from "./pricing-options";

// Single-option price display. There is one purchase option per product, so
// this is purely informational — no selection. Consumer clubs show the
// monthly subscription price; camps/paid events the upfront total; free and
// municipality (external) products show a no-payment note.

interface PricingPanelViewProps {
  option: PricingOption;
  currency: SupportedCurrency;
  locale: string;
}

export function PricingPanelView({
  option,
  currency,
  locale,
}: PricingPanelViewProps) {
  return (
    <div className="space-y-3">
      <OptionRow option={option} currency={currency} locale={locale} />
    </div>
  );
}

function OptionRow({
  option,
  currency,
  locale,
}: {
  option: PricingOption;
  currency: SupportedCurrency;
  locale: string;
}) {
  const t = useTranslations("productDetail.pricing");
  switch (option.kind) {
    case "subscription":
      return (
        <div className="rounded-md border border-border p-3">
          <p className="text-base font-bold tabular-nums">
            {formatCurrencyFromCents(option.totalCents, currency, locale)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {t("cadenceMonth")}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("subscriptionHint")}
          </p>
        </div>
      );
    case "upfront":
      return (
        <div className="rounded-md border border-border p-3">
          <p className="text-base font-bold tabular-nums">
            {formatCurrencyFromCents(option.totalCents, currency, locale)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("upfrontHint")}
          </p>
        </div>
      );
    case "free":
      return (
        <div className="rounded-md border border-border p-3">
          <p className="text-base font-bold">{t("free")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("freeHint")}</p>
        </div>
      );
    case "external":
      return (
        <div className="rounded-md border border-border p-3">
          <p className="text-base font-bold">{t("external")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("externalHint")}
          </p>
        </div>
      );
    case "unavailable":
      return (
        <div className="rounded-md border border-border p-3">
          <p className="text-sm text-muted-foreground">
            {t("notAvailable", { currency: option.currency })}
          </p>
        </div>
      );
  }
}
