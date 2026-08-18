"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  CURRENCY_CONFIG,
  DEFAULT_CURRENCY,
  type SupportedCurrency,
} from "@/lib/constants";

export type PricingShapeUI = "monthly" | "upfront_total";

export interface PricingBlockState {
  prices: Record<SupportedCurrency, { session: string; month: string }>;
}

interface PricingBlockProps {
  shape: PricingShapeUI;
  state: PricingBlockState;
  onChange: (next: PricingBlockState) => void;
}

// Single EUR price input. The platform is EUR-only (see
// src/lib/constants/currency.ts); re-enabling other currencies means bringing
// back a currency picker and per-currency rows here — see the
// "Re-enabling non-EUR currencies" section in TODO.md.
export function PricingBlock({ shape, state, onChange }: PricingBlockProps) {
  const t = useTranslations("admin.products.pricing");
  const { prices } = state;

  // Each paid type collects a single price: `month` for the consumer-club
  // monthly subscription, `session` for the camp/event upfront total.
  const field: "session" | "month" = shape === "monthly" ? "month" : "session";

  const setRow = (value: string) => {
    onChange({
      ...state,
      prices: {
        ...prices,
        [DEFAULT_CURRENCY]: { ...prices[DEFAULT_CURRENCY], [field]: value },
      },
    });
  };

  const label = shape === "monthly" ? t("perMonthLabel") : t("totalLabel");

  // The floor the validator enforces, in the decimal form the input speaks —
  // derived from the same per-currency constant rather than restated, so the
  // number the browser refuses and the number we refuse cannot drift apart.
  const minimum = (
    CURRENCY_CONFIG[DEFAULT_CURRENCY].minimumChargeCents / 100
  ).toFixed(2);

  return (
    <Field label={label} htmlFor="price-eur">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {CURRENCY_CONFIG[DEFAULT_CURRENCY].symbol}
        </span>
        <Input
          id="price-eur"
          type="number"
          // A paid product's price starts at the currency's minimum charge at
          // Stripe; "free" is the billing radio's answer, never a zero typed
          // here, and anything under the minimum is a price no family could
          // ever pay.
          min={minimum}
          step="0.01"
          value={prices[DEFAULT_CURRENCY][field]}
          onChange={(e) => setRow(e.target.value)}
          required
          className="pl-7"
        />
      </div>
    </Field>
  );
}
