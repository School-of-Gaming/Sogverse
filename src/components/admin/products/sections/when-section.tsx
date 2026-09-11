"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatInTimeZone } from "date-fns-tz";
import { StatusLine } from "@/components/ui/alert";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { PRODUCT_TIMEZONES } from "@/lib/constants";
import { formatAdminTermWeeks } from "@/lib/products/format-product-term-dates";
import {
  firstSessionDate,
  isSessionDay,
  lastSessionDate,
} from "@/lib/session-dates";
import { formatTimezoneOptionLabel } from "@/lib/timezone";
import { cn, formatDateOnly } from "@/lib/utils";
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

/**
 * The ids a control is described by, space-joined, or `undefined` when there
 * are none — an empty `aria-describedby` is a pointer at nothing, which some
 * screen readers announce as a missing description rather than as no
 * description.
 */
function describedBy(...ids: readonly (string | undefined)[]): string | undefined {
  const present = ids.filter((id) => id !== undefined);
  return present.length === 0 ? undefined : present.join(" ");
}

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
  const c = useTranslations("common");
  const locale = useLocale();
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

  // Today in the *product's* zone, not the reader's: these fields are about the
  // product's own calendar, so the day the picker rings has to be the product's
  // today. Computed once here and handed to every picker in the section, so the
  // pickers cannot disagree about which day that is.
  const today = formatInTimeZone(now, state.timezone, "yyyy-MM-dd");

  // An event's single date derives its own weekday, and a product mid-authoring
  // may have no slots at all — either way there is no pattern to snap a week
  // pick to, and `firstSessionDate`/`lastSessionDate` fall through to plain
  // Monday/Sunday on an empty list.
  const weekdays =
    productType === "event"
      ? []
      : state.scheduleSlots.map((slot) => slot.weekday);

  // The warning fires only where a pattern exists to contradict the date.
  // `isSessionDay` already answers true for an empty one; the length check is
  // what additionally keeps an event — whose slot follows the date rather than
  // the other way round — out of it entirely.
  const startWarning =
    weekdays.length > 0 &&
    state.startDate !== "" &&
    !isSessionDay(state.startDate, weekdays)
      ? t("hints.startNotSessionDay", {
          date: formatDateOnly(
            firstSessionDate(state.startDate, weekdays),
            locale,
            { weekday: "short", day: "numeric", month: "long" },
          ),
        })
      : null;
  const endWarning =
    weekdays.length > 0 &&
    state.endDate !== "" &&
    !isSessionDay(state.endDate, weekdays)
      ? t("hints.endNotSessionDay", {
          date: formatDateOnly(
            lastSessionDate(state.endDate, weekdays),
            locale,
            { weekday: "short", day: "numeric", month: "long" },
          ),
        })
      : null;

  // A warning rendered as loose text under a control says nothing to anyone not
  // looking at the screen. Each one carries an id its picker points at with
  // `aria-describedby`, and `role="status"` so the warning is announced when it
  // appears rather than only when the field is next visited. Only one end-date
  // picker is ever mounted (the grid's, or the consumer club's), so the single
  // end id is never duplicated.
  const warningIds = useId();
  const startWarningId = `${warningIds}-start`;
  const endWarningId = `${warningIds}-end`;

  // The term as an admin planning in weeks reads it. Nothing is reserved for
  // it: it appears because the admin just picked the second of the two dates,
  // which is their own action and the one case the layout rule allows to
  // reflow.
  //
  // The string itself is `formatAdminTermWeeks`', not this section's: the
  // product details page prints the same readout, and the choice between a
  // same-year range and a year-qualified one is a decision that must be made in
  // exactly one place or a term crossing New Year reads correctly on one
  // surface and as "wk 34–2" on the other.
  const termText =
    state.startDate !== "" &&
    state.endDate !== "" &&
    state.endDate >= state.startDate
      ? formatAdminTermWeeks(
          { start_date: state.startDate, end_date: state.endDate },
          c,
        )
      : null;
  const termLine =
    termText === null ? null : (
      <p className="text-xs tabular-nums text-muted-foreground">{termText}</p>
    );

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
                  "flex items-start gap-3 rounded-md border border-border p-3 text-sm transition-colors",
                  state.startMode === option && "border-act",
                  lockStartMode ? "cursor-not-allowed opacity-60" : "cursor-pointer"
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
                  className="mt-1 h-4 w-4 accent-act"
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
              {({ hintId }) => (
                <>
                  <DatePicker
                    id="p-start-date"
                    value={state.startDate}
                    onChange={(startDate) => setState({ ...state, startDate })}
                    today={today}
                    weekPick={{ edge: "start", weekdays }}
                    rangeEnd={state.endDate === "" ? null : state.endDate}
                    aria-describedby={describedBy(
                      startWarning === null ? undefined : startWarningId,
                      hintId,
                    )}
                    required
                  />
                  {/* The warning sits between the control and the field's own
                      hint, which is the order the two want: the date being
                      wrong comes before the billing anchor is worth
                      explaining. It appears as the direct result of the
                      admin's own pick, so its reflow is the permitted kind. */}
                  {startWarning !== null && (
                    <StatusLine
                      id={startWarningId}
                      role="status"
                      status="warning"
                      size="xs"
                      muted
                    >
                      {startWarning}
                    </StatusLine>
                  )}
                </>
              )}
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
                <DatePicker
                  id="p-end-date"
                  value={state.endDate}
                  onChange={(endDate) => setState({ ...state, endDate })}
                  today={today}
                  weekPick={{ edge: "end", weekdays }}
                  rangeStart={state.startDate === "" ? null : state.startDate}
                  aria-describedby={describedBy(
                    endWarning === null ? undefined : endWarningId,
                  )}
                  required
                />
                {endWarning !== null && (
                  <StatusLine
                    id={endWarningId}
                    role="status"
                    status="warning"
                    size="xs"
                    muted
                  >
                    {endWarning}
                  </StatusLine>
                )}
              </Field>
            )}
          </div>

          {/* The term summary belongs under the pair of dates that produce it,
              so it rides with the grid — except on a consumer club, whose end
              date is not in the grid at all and carries the line itself. */}
          {productType === "event" || productType === "consumer_club"
            ? null
            : termLine}

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
                        "flex items-start gap-3 rounded-md border border-border p-3 text-sm transition-colors",
                        active && "border-act",
                        "cursor-pointer"
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
                        className="mt-1 h-4 w-4 accent-act"
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
                <div className="mt-3 max-w-[280px] space-y-2">
                  <DatePicker
                    id="p-end-date"
                    aria-label={t("labels.endDate")}
                    value={state.endDate}
                    onChange={(endDate) => setState({ ...state, endDate })}
                    today={today}
                    weekPick={{ edge: "end", weekdays }}
                    rangeStart={state.startDate === "" ? null : state.startDate}
                    aria-describedby={describedBy(
                      endWarning === null ? undefined : endWarningId,
                    )}
                    required
                  />
                  {endWarning !== null && (
                    <StatusLine
                      id={endWarningId}
                      role="status"
                      status="warning"
                      size="xs"
                      muted
                    >
                      {endWarning}
                    </StatusLine>
                  )}
                  {termLine}
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
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
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
