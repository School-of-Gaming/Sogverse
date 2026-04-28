"use client";

import { CircleDollarSign, Gift, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useFxRatesFromEur } from "@/services/products-v2";
import { Field, FormSection } from "../form-primitives";
import { PricingBlock } from "../pricing-block";
import {
  PAID_MODE_VALUES,
  effectiveBillingMode,
  effectivePricingShape,
  type FormState,
} from "../product-v2-form-state";
import type { ProductTypeConfig } from "../product-v2-type-config";

interface BillingSectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
  config: ProductTypeConfig;
}

export function BillingSection({
  state,
  setState,
  config,
}: BillingSectionProps) {
  const t = useTranslations("admin.productsV2");
  const fxRatesQuery = useFxRatesFromEur(true);

  const billingMode = effectiveBillingMode(config, state.paidMode);
  const isPaid = billingMode === "paid";
  const showPricing = isPaid && config.pricingShape !== "external";
  const pricingShape = effectivePricingShape(config);
  const showExternalInfo = billingMode === "external_contract";

  // Free events can have no seat limit; the rest always do.
  const canUncap = config.productType === "event" && billingMode === "free";
  const seatInputDisabled = canUncap && state.uncapped;

  return (
    <FormSection
      title={t("sections.billing")}
      description={t(`sections.billingDescription.${config.i18nKey}`)}
    >
      {config.billing.mode === "free_or_paid" && (
        <Field label={t("labels.billing")} hint={t("hints.billingHint")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {PAID_MODE_VALUES.map((mode) => {
              const active = state.paidMode === mode;
              const Icon = mode === "free" ? Gift : CircleDollarSign;
              return (
                <label
                  key={mode}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-input hover:border-foreground/30"
                  )}
                >
                  <input
                    type="radio"
                    name="paidMode"
                    checked={active}
                    onChange={() => setState({ ...state, paidMode: mode })}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Icon className="h-4 w-4 text-primary" />
                      {t(`labels.${mode}`)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t(`hints.${mode}Detail`)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </Field>
      )}

      {showExternalInfo && (
        <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="font-medium">{t("labels.paidByMunicipality")}</div>
            <div className="text-xs text-muted-foreground">
              {t("hints.paidByMunicipality")}
            </div>
          </div>
        </div>
      )}

      {showPricing && (
        <Field
          label={t("labels.pricing")}
          hint={
            pricingShape === "session_and_month"
              ? t("hints.pricingPerSession")
              : t("hints.pricingUpfront")
          }
        >
          <PricingBlock
            shape={pricingShape}
            state={{
              prices: state.prices,
              manualEdits: state.manualEdits,
              activeCurrency: state.activeCurrency,
            }}
            onChange={(next) => setState({ ...state, ...next })}
            fxRates={fxRatesQuery.data}
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("labels.seatCount")}
          htmlFor="p-seat"
          required={!seatInputDisabled}
          hint={canUncap ? t("hints.seatCanUncap") : t("hints.seatHint")}
        >
          <Input
            id="p-seat"
            type="number"
            min="1"
            value={seatInputDisabled ? "" : state.seatCount}
            onChange={(e) =>
              setState({ ...state, seatCount: e.target.value })
            }
            disabled={seatInputDisabled}
            placeholder={
              seatInputDisabled ? t("placeholders.noLimit") : undefined
            }
            required={!seatInputDisabled}
          />
        </Field>

        {canUncap && (
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.uncapped}
                onChange={(e) =>
                  setState({ ...state, uncapped: e.target.checked })
                }
                className="h-4 w-4"
              />
              <span>{t("labels.noSeatLimit")}</span>
            </label>
          </div>
        )}
      </div>

      {!seatInputDisabled && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={state.waitlistEnabled}
            onChange={(e) =>
              setState({ ...state, waitlistEnabled: e.target.checked })
            }
            className="h-4 w-4"
          />
          <span>{t("labels.waitlistToggle")}</span>
        </label>
      )}
    </FormSection>
  );
}
