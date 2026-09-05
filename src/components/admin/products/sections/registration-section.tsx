"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { formatTimezoneOptionLabel } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { useNow } from "@/providers";
import { FormSection, InfoCallout } from "../form-primitives";
import { formLocksFor } from "../form-locks";
import {
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  REGISTRATION_OPENS_MODE_VALUES,
  type FormState,
} from "../product-form-state";
import type { ProductTypeConfig } from "../product-type-config";

interface RegistrationSectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
  config: ProductTypeConfig;
}

export function RegistrationSection({
  state,
  setState,
  config,
}: RegistrationSectionProps) {
  const t = useTranslations("admin.products");
  const now = useNow();

  // Pre-prod UI lock (see form-locks.ts): registration always opens immediately
  // and the chooser is pinned to "Right away" — except on municipality clubs,
  // where the scheduled ticket drop is signed off and the chooser is editable.
  const lockTiming = formLocksFor(config).registrationTiming;

  return (
    <FormSection
      title={t("sections.registration")}
      description={t("sections.registrationDescription")}
    >
      <Field label={t("registrationModes.label")}>
        <div className="space-y-2">
          {REGISTRATION_OPENS_MODE_VALUES.map((option) => (
            <label
              key={option}
              className={cn(
                "flex items-start gap-3 rounded-md border border-border p-3 text-sm transition-colors",
                state.registrationOpensMode === option && "bg-primary/5",
                lockTiming ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              )}
            >
              <input
                type="radio"
                name="registrationOpensMode"
                checked={state.registrationOpensMode === option}
                disabled={lockTiming}
                onChange={() =>
                  setState({ ...state, registrationOpensMode: option })
                }
                className="mt-1 h-4 w-4"
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {t(`registrationModes.${option}`)}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t(`registrationModes.${option}Description`)}
                </div>
              </div>
            </label>
          ))}
        </div>
      </Field>

      {state.registrationOpensMode === "scheduled" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("labels.date")} htmlFor="p-opens-date">
              <Input
                id="p-opens-date"
                type="date"
                value={state.registrationOpensDate}
                onChange={(e) =>
                  setState({
                    ...state,
                    registrationOpensDate: e.target.value,
                  })
                }
                required
              />
            </Field>
            <Field label={t("labels.time")}>
              <div className="flex items-center gap-1">
                <select
                  aria-label={t("schedule.hour")}
                  value={state.registrationOpensHour}
                  onChange={(e) =>
                    setState({
                      ...state,
                      registrationOpensHour: e.target.value,
                    })
                  }
                  className="flex h-10 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="text-muted-foreground">:</span>
                <select
                  aria-label={t("schedule.minute")}
                  value={state.registrationOpensMinute}
                  onChange={(e) =>
                    setState({
                      ...state,
                      registrationOpensMinute: e.target.value,
                    })
                  }
                  className="flex h-10 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {MINUTE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          </div>
          {/* The zone is picked in the When section; this only reports it, and
              reports it through the same formatter, so the two sections cannot
              describe one field two ways. */}
          <InfoCallout
            text={t("hints.timezoneIs", {
              timezone: formatTimezoneOptionLabel(state.timezone, now),
            })}
          />
        </>
      )}
    </FormSection>
  );
}
