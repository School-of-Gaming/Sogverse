"use client";

import { useTranslations } from "next-intl";
import { formatCurrencyFromCents } from "@/lib/utils";
import type { SupportedCurrency } from "@/lib/constants/currency";
import { CurrencyPicker } from "@/components/layout/currency-picker";
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
  // Free / external products don't display a price, so the currency picker
  // would just be visual noise. For `unavailable` we keep it — that branch is
  // literally "this currency isn't sold here", so the picker is the fix.
  const showCurrencyPicker =
    option.kind !== "free" && option.kind !== "external";

  return (
    <div className="space-y-3">
      {showCurrencyPicker && <CurrencyPickerRow />}
      <OptionRow option={option} currency={currency} locale={locale} />
    </div>
  );
}

function CurrencyPickerRow() {
  const t = useTranslations("productDetail.pricing");
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <span>{t("pricesIn")}</span>
      <CurrencyPicker />
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
