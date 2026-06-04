"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Field, FormSection, InfoCallout } from "../form-primitives";
import { FORM_LOCKS } from "../form-locks";
import {
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  REGISTRATION_OPENS_MODE_VALUES,
  type FormState,
} from "../product-form-state";

interface RegistrationSectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
}

export function RegistrationSection({
  state,
  setState,
}: RegistrationSectionProps) {
  const t = useTranslations("admin.products");

  // Pre-prod UI lock (see form-locks.ts): registration always opens
  // immediately, so the chooser is pinned to "Right away".
  const lockTiming = FORM_LOCKS.registrationTiming;

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
                "flex items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                state.registrationOpensMode === option
                  ? "border-primary bg-primary/5"
                  : "border-input",
                lockTiming
                  ? "cursor-not-allowed opacity-60"
                  : cn(
                      "cursor-pointer",
                      state.registrationOpensMode !== option &&
                        "hover:border-foreground/30"
                    )
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
            <Field label={t("labels.date")} htmlFor="p-opens-date" required>
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
                  className="flex h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm"
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
                  className="flex h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm"
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
          <InfoCallout text={t("hints.timezoneFixedHelsinki")} />
        </>
      )}
    </FormSection>
  );
}
