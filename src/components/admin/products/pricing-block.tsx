"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CURRENCY_CONFIG,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/lib/constants";
import { applyFxAutoFill } from "./pricing-block-fx";
import type { FxRates } from "@/services/products";

export type PricingShapeUI = "monthly" | "upfront_total";

export interface PricingBlockState {
  prices: Record<SupportedCurrency, { session: string; month: string }>;
  manualEdits: Set<SupportedCurrency>;
  activeCurrency: SupportedCurrency;
}

interface PricingBlockProps {
  shape: PricingShapeUI;
  state: PricingBlockState;
  onChange: (next: PricingBlockState) => void;
  fxRates: FxRates | undefined;
}

export function PricingBlock({
  shape,
  state,
  onChange,
  fxRates,
}: PricingBlockProps) {
  const t = useTranslations("admin.products.pricing");
  const { prices, manualEdits, activeCurrency } = state;

  // Each paid type collects a single price: `month` for the consumer-club
  // monthly subscription, `session` for the camp/event upfront total. The
  // DB keeps both columns; the unused one is written as 0 in product-build.
  const field: "session" | "month" = shape === "monthly" ? "month" : "session";

  // Re-fill every non-EUR currency from EUR × today's rate whenever EUR
  // changes — except currencies the admin has manually overridden. The
  // effect doesn't add the auto-filled currencies to `manualEdits`, so
  // future EUR edits keep propagating to them. Manual override is one-way
  // (set in `setRow`). The decision logic lives in `applyFxAutoFill` so
  // it can be unit-tested without rendering.
  useEffect(() => {
    const next = applyFxAutoFill({ prices, manualEdits, shape, fxRates });
    if (next) onChange({ ...state, prices: next });
  }, [fxRates, prices, manualEdits, shape, state, onChange]);

  const setActive = (currency: SupportedCurrency) => {
    if (currency === activeCurrency) return;
    onChange({ ...state, activeCurrency: currency });
  };

  const setRow = (currency: SupportedCurrency, value: string) => {
    // EUR is the FX source — it's never auto-filled, so it never needs
    // to be locked. Only non-EUR keystrokes mark a currency as manual.
    const nextManualEdits =
      currency === DEFAULT_CURRENCY
        ? manualEdits
        : new Set([...manualEdits, currency]);
    onChange({
      ...state,
      prices: {
        ...prices,
        [currency]: { ...prices[currency], [field]: value },
      },
      manualEdits: nextManualEdits,
    });
  };

  // FX note shows on non-EUR tabs that the admin hasn't overridden, as
  // long as we have rates to display.
  const showSubFxNote =
    activeCurrency !== DEFAULT_CURRENCY &&
    !manualEdits.has(activeCurrency) &&
    Boolean(fxRates);

  const label = shape === "monthly" ? t("perMonthLabel") : t("totalLabel");

  return (
    <div className="space-y-3">
      {/* Currency tabs */}
      <div
        role="tablist"
        aria-label={t("currencyPickerLabel")}
        className="inline-flex rounded-md border border-input p-1"
      >
        {SUPPORTED_CURRENCIES.map((currency) => {
          const cfg = CURRENCY_CONFIG[currency];
          const active = currency === activeCurrency;
          return (
            <button
              key={currency}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActive(currency)}
              className={cn(
                "rounded px-3 py-1 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {cfg.symbol} {cfg.label}
            </button>
          );
        })}
      </div>

      {showSubFxNote && fxRates && (
        <p className="text-xs text-muted-foreground">
          {t("fxSuggested", {
            rate: fxRates[activeCurrency].toFixed(4),
          })}
        </p>
      )}

      {/* Single price input for the active tab */}
      <div className="space-y-1.5">
        <Label htmlFor={`price-${activeCurrency}`}>
          {label}
          <span className="ml-0.5 text-destructive">*</span>
        </Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {CURRENCY_CONFIG[activeCurrency].symbol}
          </span>
          <Input
            id={`price-${activeCurrency}`}
            type="number"
            min="0"
            step="0.01"
            value={prices[activeCurrency][field]}
            onChange={(e) => setRow(activeCurrency, e.target.value)}
            required
            className="pl-7"
          />
        </div>
      </div>
    </div>
  );
}
