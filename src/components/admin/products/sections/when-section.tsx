"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { FormSection, InfoCallout } from "../form-primitives";
import { formLocksFor } from "../form-locks";
import { ScheduleSlotsEditor } from "../schedule-slots-editor";
import {
  END_DATE_MODE_VALUES,
  startModeUsesDate,
  startModeUsesThreshold,
  type FormState,
} from "../product-form-state";
import type { ProductTypeConfig } from "../product-type-config";

interface WhenSectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
  config: ProductTypeConfig;
}

export function WhenSection({ state, setState, config }: WhenSectionProps) {
  const t = useTranslations("admin.products");

  const productType = config.productType;
  const startTriggerOptions = config.allowedStartModes;
  const usesDate = startModeUsesDate(state.startMode);
  const usesThreshold = startModeUsesThreshold(state.startMode);

  // Pre-prod UI locks, resolved through form-locks.ts like every other section
  // — the lock below lifts for no product today, but reading the constant
  // directly would put a second decision-maker next to the resolver. The start
  // trigger is pinned to the type's default ("On a specific date").
  const locks = formLocksFor(config);
  const lockStartMode = locks.startMode;
  // A consumer club's first charge is deferred to its start date, so the date
  // is now editable — with the warning that moving it later does NOT move the
  // anchor on subscriptions that already exist (that correction is manual in
  // Stripe; see the checkout route and TODO.md).
  const startDateMovesBilling = productType === "consumer_club";

  return (
    <FormSection
      title={t("sections.when")}
      description={t(`sections.whenDescription.${config.i18nKey}`)}
    >
      {startTriggerOptions.length > 1 && (
        <Field label={t("startModes.label")}>
          <div className="space-y-2">
            {startTriggerOptions.map((option) => (
              <label
                key={option}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                  state.startMode === option
                    ? "border-primary bg-primary/5"
                    : "border-input",
                  lockStartMode
                    ? "cursor-not-allowed opacity-60"
                    : cn(
                        "cursor-pointer",
                        state.startMode !== option &&
                          "hover:border-foreground/30"
                      )
                )}
              >
                <input
                  type="radio"
                  name="startTrigger"
                  checked={state.startMode === option}
                  disabled={lockStartMode}
                  onChange={() =>
                    setState({
                      ...state,
                      startMode: option,
                      signupThreshold:
                        option === "date" ? "" : state.signupThreshold,
                      startDate:
                        option === "threshold" ? "" : state.startDate,
                      endDate: option === "threshold" ? "" : state.endDate,
                    })
                  }
                  className="mt-1 h-4 w-4"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {t(`startModes.${option}`)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t(`startModes.${option}Description`)}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </Field>
      )}

      {usesDate && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label={
                productType === "event"
                  ? t("labels.eventDate")
                  : t("labels.startDate")
              }
              htmlFor="p-start-date"
              hint={
                startDateMovesBilling
                  ? t("hints.startDateBillingAnchor")
                  : undefined
              }
            >
              <Input
                id="p-start-date"
                type="date"
                value={state.startDate}
                onChange={(e) =>
                  setState({ ...state, startDate: e.target.value })
                }
                required
              />
            </Field>
            {productType === "event" ? (
              <div className="flex items-end text-xs text-muted-foreground">
                <Info className="mr-1.5 inline h-3.5 w-3.5" />
                {t("hints.eventSingleDay")}
              </div>
            ) : productType === "consumer_club" ? null : (
              // Municipality clubs and camps always have a fixed end date.
              <Field
                label={
                  productType === "municipality_club"
                    ? t("labels.seasonEndDate")
                    : t("labels.endDate")
                }
                htmlFor="p-end-date"
              >
                <Input
                  id="p-end-date"
                  type="date"
                  value={state.endDate}
                  onChange={(e) =>
                    setState({ ...state, endDate: e.target.value })
                  }
                  required
                />
              </Field>
            )}
          </div>

          {/* Consumer clubs are ongoing by default. The admin picks "no end
              date" or "set an end date"; the date input only shows for the
              latter — avoids Safari's native date field, which can't be left
              blank to mean "ongoing". */}
          {productType === "consumer_club" && (
            <Field label={t("labels.endDate")}>
              <div className="space-y-2">
                {END_DATE_MODE_VALUES.map((option) => {
                  const active = state.hasEndDate === (option === "dated");
                  return (
                    <label
                      key={option}
                      className={cn(
                        "flex items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                        active
                          ? "border-primary bg-primary/5"
                          : "border-input",
                        "cursor-pointer",
                        !active && "hover:border-foreground/30"
                      )}
                    >
                      <input
                        type="radio"
                        name="endDateMode"
                        checked={active}
                        onChange={() =>
                          setState({
                            ...state,
                            hasEndDate: option === "dated",
                            // Clear the date when going back to ongoing so a
                            // stale value can't leak into the payload.
                            endDate:
                              option === "ongoing" ? "" : state.endDate,
                          })
                        }
                        className="mt-1 h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {t(`endDateModes.${option}`)}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {t(`endDateModes.${option}Description`)}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {state.hasEndDate && (
                <div className="mt-3 max-w-[240px]">
                  <Input
                    id="p-end-date"
                    type="date"
                    aria-label={t("labels.endDate")}
                    value={state.endDate}
                    onChange={(e) =>
                      setState({ ...state, endDate: e.target.value })
                    }
                    required
                  />
                </div>
              )}
            </Field>
          )}
        </div>
      )}

      {usesThreshold && (
        <Field
          label={t("labels.signupThreshold")}
          htmlFor="p-threshold"
          hint={
            state.startMode === "threshold"
              ? t("hints.thresholdOnly")
              : t("hints.thresholdWithDate")
          }
        >
          <Input
            id="p-threshold"
            type="number"
            min="1"
            placeholder={t("placeholders.threshold")}
            value={state.signupThreshold}
            onChange={(e) =>
              setState({ ...state, signupThreshold: e.target.value })
            }
            className="max-w-[220px]"
            required
          />
        </Field>
      )}

      <InfoCallout text={t("hints.timezoneFixedHelsinki")} />

      <Field
        label={
          productType === "camp"
            ? t("labels.daysAndTimes")
            : productType === "event"
              ? t("labels.time")
              : t("labels.dayAndTime")
        }
      >
        <ScheduleSlotsEditor
          productType={productType}
          slots={state.scheduleSlots}
          onChange={(slots) =>
            setState({ ...state, scheduleSlots: slots })
          }
        />
      </Field>
    </FormSection>
  );
}
