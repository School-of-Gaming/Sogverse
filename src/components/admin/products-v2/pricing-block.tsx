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
import {
  BundlePricePreview,
  SubscriptionPricePreview,
} from "./price-previews";
import { applyFxAutoFill } from "./pricing-block-fx";
import type { FxRates } from "@/services/products-v2";

export type PricingShapeUI = "session_and_month" | "upfront_total";

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
  const t = useTranslations("admin.productsV2.pricing");
  const { prices, manualEdits, activeCurrency } = state;

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

  const setRow = (
    currency: SupportedCurrency,
    field: "session" | "month",
    value: string
  ) => {
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

  const sessionLabel =
    shape === "session_and_month" ? t("perSessionLabel") : t("totalLabel");

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

      {/* Inputs for the active tab */}
      <div
        className={cn(
          "grid gap-4",
          shape === "session_and_month" ? "sm:grid-cols-2" : "sm:grid-cols-1"
        )}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`price-session-${activeCurrency}`}>
            {sessionLabel}
            <span className="ml-0.5 text-destructive">*</span>
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {CURRENCY_CONFIG[activeCurrency].symbol}
            </span>
            <Input
              id={`price-session-${activeCurrency}`}
              type="number"
              min="0"
              step="0.01"
              value={prices[activeCurrency].session}
              onChange={(e) =>
                setRow(activeCurrency, "session", e.target.value)
              }
              required
              className="pl-7"
            />
          </div>
          {shape === "session_and_month" && (
            <BundlePricePreview
              value={prices[activeCurrency].session}
              currency={activeCurrency}
            />
          )}
        </div>

        {shape === "session_and_month" && (
          <div className="space-y-1.5">
            <Label htmlFor={`price-month-${activeCurrency}`}>
              {t("perMonthLabel")}
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {CURRENCY_CONFIG[activeCurrency].symbol}
              </span>
              <Input
                id={`price-month-${activeCurrency}`}
                type="number"
                min="0"
                step="0.01"
                value={prices[activeCurrency].month}
                onChange={(e) =>
                  setRow(activeCurrency, "month", e.target.value)
                }
                required
                className="pl-7"
              />
            </div>
            <SubscriptionPricePreview
              value={prices[activeCurrency].month}
              currency={activeCurrency}
            />
          </div>
        )}
      </div>
    </div>
  );
}
