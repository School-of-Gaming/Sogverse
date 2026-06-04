"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  return (
    <div className="space-y-1.5">
      <Label htmlFor="price-eur">
        {label}
        <span className="ml-0.5 text-destructive">*</span>
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {CURRENCY_CONFIG[DEFAULT_CURRENCY].symbol}
        </span>
        <Input
          id="price-eur"
          type="number"
          min="0"
          step="0.01"
          value={prices[DEFAULT_CURRENCY][field]}
          onChange={(e) => setRow(e.target.value)}
          required
          className="pl-7"
        />
      </div>
    </div>
  );
}
