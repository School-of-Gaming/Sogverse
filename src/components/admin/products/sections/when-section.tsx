"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useHolidayCalendars } from "@/services/products";
import { Field, FormSection, InfoCallout } from "../form-primitives";
import { HolidayCalendarOption } from "../holiday-calendar-option";
import { ScheduleSlotsEditor } from "../schedule-slots-editor";
import {
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
  const { data: calendars } = useHolidayCalendars();

  const productType = config.productType;
  const startTriggerOptions = config.allowedStartModes;
  const usesDate = startModeUsesDate(state.startMode);
  const usesThreshold = startModeUsesThreshold(state.startMode);
  const showHolidayCalendars = config.hasHolidayCalendars;

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
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                  state.startMode === option
                    ? "border-primary bg-primary/5"
                    : "border-input hover:border-foreground/30"
                )}
              >
                <input
                  type="radio"
                  name="startTrigger"
                  checked={state.startMode === option}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={
              productType === "event"
                ? t("labels.eventDate")
                : t("labels.startDate")
            }
            htmlFor="p-start-date"
            required
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
          ) : (
            <Field
              label={
                productType === "consumer_club"
                  ? t("labels.endDateOptional")
                  : productType === "municipality_club"
                    ? t("labels.seasonEndDate")
                    : t("labels.endDate")
              }
              htmlFor="p-end-date"
              hint={
                productType === "consumer_club"
                  ? t("hints.endDateOpt")
                  : undefined
              }
              required={productType !== "consumer_club"}
            >
              <Input
                id="p-end-date"
                type="date"
                value={state.endDate}
                onChange={(e) =>
                  setState({ ...state, endDate: e.target.value })
                }
                required={productType !== "consumer_club"}
              />
            </Field>
          )}
        </div>
      )}

      {usesThreshold && (
        <Field
          label={t("labels.signupThreshold")}
          htmlFor="p-threshold"
          required
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

      <div className="space-y-2">
        <Label>
          {productType === "camp"
            ? t("labels.daysAndTimes")
            : productType === "event"
              ? t("labels.time")
              : t("labels.dayAndTime")}
        </Label>
        <ScheduleSlotsEditor
          productType={productType}
          slots={state.scheduleSlots}
          onChange={(slots) =>
            setState({ ...state, scheduleSlots: slots })
          }
        />
      </div>

      {showHolidayCalendars && (
        <Field
          label={t("labels.holidayCalendars")}
          hint={t("hints.holidayHint")}
        >
          <div className="space-y-2">
            {calendars?.map((cal) => (
              <HolidayCalendarOption
                key={cal.id}
                calendar={cal}
                checked={state.holidayCalendarIds.has(cal.id)}
                onToggle={() => {
                  const next = new Set(state.holidayCalendarIds);
                  if (next.has(cal.id)) next.delete(cal.id);
                  else next.add(cal.id);
                  setState({ ...state, holidayCalendarIds: next });
                }}
              />
            ))}
          </div>
        </Field>
      )}
    </FormSection>
  );
}
