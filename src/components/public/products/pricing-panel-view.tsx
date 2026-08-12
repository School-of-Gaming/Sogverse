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
  /**
   * Already-formatted date of the first charge, when a subscription's billing is
   * deferred to a start date still ahead. Null everywhere else — including on
   * every non-subscription option, which is why only that branch reads it.
   */
  firstChargeDate?: string | null;
}

export function PricingPanelView({
  option,
  currency,
  locale,
  firstChargeDate = null,
}: PricingPanelViewProps) {
  return (
    <div className="space-y-3">
      <OptionRow
        option={option}
        currency={currency}
        locale={locale}
        firstChargeDate={firstChargeDate}
      />
    </div>
  );
}

function OptionRow({
  option,
  currency,
  locale,
  firstChargeDate,
}: {
  option: PricingOption;
  currency: SupportedCurrency;
  locale: string;
  firstChargeDate: string | null;
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
          {/* The club has not started, so Stripe will show €0 due today. Say
              why, and say when the money actually moves, before the parent
              clicks through to a page that would otherwise look like a
              mistake. Rendered from data present on first paint, so it never
              arrives late and pushes the CTA down. */}
          {firstChargeDate !== null && (
            <p className="mt-1.5 text-xs font-medium text-primary">
              {t("firstChargeOn", { date: firstChargeDate })}
            </p>
          )}
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
