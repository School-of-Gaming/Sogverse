"use client";

import { CircleDollarSign, Gift, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Field, FormSection } from "../form-primitives";
import { FORM_LOCKS } from "../form-locks";
import { PricingBlock } from "../pricing-block";
import {
  PAID_MODE_VALUES,
  SEAT_LIMIT_MODE_VALUES,
  effectiveBillingMode,
  effectivePricingShape,
  type FormState,
} from "../product-form-state";
import type { ProductTypeConfig } from "../product-type-config";

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
  const t = useTranslations("admin.products");

  const billingMode = effectiveBillingMode(config, state.paidMode);
  const isPaid = billingMode === "paid";
  const showPricing = isPaid && config.pricingShape !== "external";
  const pricingShape = effectivePricingShape(config);
  const showExternalInfo = billingMode === "external_contract";

  // Seats: every product type may be capped or uncapped (no seat count). The
  // chooser and the waitlist toggle are pre-prod-locked for now (form-locks.ts)
  // — defaulted to "no seat limit" / waitlist off in initialState.
  const lockSeat = FORM_LOCKS.seatCount;
  const lockWaitlist = FORM_LOCKS.waitlist;

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
            pricingShape === "monthly"
              ? t("hints.pricingMonthly")
              : t("hints.pricingUpfront")
          }
        >
          <PricingBlock
            shape={pricingShape}
            state={{ prices: state.prices }}
            onChange={(next) => setState({ ...state, ...next })}
          />
        </Field>
      )}

      <Field label={t("labels.seatLimit")} hint={t("hints.seatLimitHint")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {SEAT_LIMIT_MODE_VALUES.map((mode) => {
            const active = state.uncapped === (mode === "unlimited");
            return (
              <label
                key={mode}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                  active ? "border-primary bg-primary/5" : "border-input",
                  lockSeat
                    ? "cursor-not-allowed opacity-60"
                    : cn(
                        "cursor-pointer",
                        !active && "hover:border-foreground/30"
                      )
                )}
              >
                <input
                  type="radio"
                  name="seatLimitMode"
                  checked={active}
                  disabled={lockSeat}
                  onChange={() =>
                    setState({ ...state, uncapped: mode === "unlimited" })
                  }
                  className="mt-1 h-4 w-4"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {t(`seatLimitModes.${mode}`)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t(`seatLimitModes.${mode}Description`)}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </Field>

      {!state.uncapped && (
        <Field
          label={t("labels.seatCount")}
          htmlFor="p-seat"
          required
          hint={t("hints.seatHint")}
        >
          <Input
            id="p-seat"
            type="number"
            min="1"
            value={state.seatCount}
            onChange={(e) =>
              setState({ ...state, seatCount: e.target.value })
            }
            className="max-w-[220px]"
            required
          />
        </Field>
      )}

      {!state.uncapped && (
        <label
          className={cn(
            "flex items-center gap-2 text-sm text-muted-foreground",
            lockWaitlist ? "cursor-not-allowed opacity-60" : "cursor-pointer"
          )}
        >
          <input
            type="checkbox"
            checked={state.waitlistEnabled}
            disabled={lockWaitlist}
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
