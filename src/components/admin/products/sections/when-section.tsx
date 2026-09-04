"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { PRODUCT_TIMEZONES } from "@/lib/constants";
import { formatTimezoneOptionLabel } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { useNow } from "@/providers";
import { FormSection } from "../form-primitives";
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
  /** Whether this form is editing a product that already exists. Only the
   *  timezone hint reads it: on a product whose term is already running,
   *  changing the zone re-times every session still ahead of it while leaving
   *  the ones already reported or marked at the times they were held — a
   *  consequence a create form has nothing to warn about. */
  isEdit: boolean;
}

export function WhenSection({
  state,
  setState,
  config,
  isEdit,
}: WhenSectionProps) {
  const t = useTranslations("admin.products");
  // The clock the offsets are read at, shared with the rest of the dashboard so
  // the server render and the first client render agree on which side of a DST
  // transition "now" is — a label computed from a bare `new Date()` on each end
  // could disagree by an hour on the two days a year that matters.
  const now = useNow();

  // What the picker offers: the zones the supported countries declare, plus the
  // product's own stored zone when the row arrived carrying one that is no
  // longer offered (a country dropped from the list since, or a value written
  // before the picker existed). A `<select>` whose value matches no option
  // shows the admin the first one while state holds something else, which is
  // how an admin ends up "correcting" a field into a value they never chose.
  //
  // The extra option is seeded from the value the form opened with and pinned
  // for the life of the form, never re-derived from the live field: derived
  // live, it would vanish the moment the admin selected one of the offered
  // zones, and a mis-click would be unrecoverable short of reloading the page.
  const [storedZone] = useState(() => state.timezone);
  // `.some` rather than `.includes`: the offered list is typed as the union of
  // zones a country declares, and a stored zone is whatever the column holds.
  const timezoneOptions: readonly string[] = PRODUCT_TIMEZONES.some(
    (zone) => zone === storedZone,
  )
    ? PRODUCT_TIMEZONES
    : [...PRODUCT_TIMEZONES, storedZone];

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
              // The two hints are exclusive: the billing anchor is a consumer
              // club's, the single-date note an event's. The event's used to
              // sit in the empty second column as a bottom-aligned box beside
              // the input, which read as misaligned; the field's own hint slot
              // is where every other hint on this form lives.
              hint={
                startDateMovesBilling
                  ? t("hints.startDateBillingAnchor")
                  : productType === "event"
                    ? t("hints.eventSingleDay")
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
            {productType === "event" || productType === "consumer_club" ? null : (
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

      {/* The zone every wall clock below is entered in. It sits directly above
          the schedule rather than in its own section: the times are read in it,
          so it has to be visible while they are being typed. */}
      <Field
        label={t("labels.timezone")}
        htmlFor="p-timezone"
        hint={
          isEdit ? t("hints.timezoneChangeMoves") : t("hints.timezoneEntry")
        }
      >
        <select
          id="p-timezone"
          value={state.timezone}
          onChange={(e) => setState({ ...state, timezone: e.target.value })}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {timezoneOptions.map((zone) => (
            <option key={zone} value={zone}>
              {formatTimezoneOptionLabel(zone, now)}
            </option>
          ))}
        </select>
      </Field>

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
