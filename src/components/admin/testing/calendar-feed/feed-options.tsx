"use client";

import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { findOption } from "@/lib/utils";
import {
  ALARM_VALUES,
  BUSY_VALUES,
  CALENDAR_FEED_DEFAULTS,
  CALNAME_MAX_LENGTH,
  COLOR_VALUES,
  DETAILS_VALUES,
  METHOD_VALUES,
  MODE_VALUES,
  REFRESH_VALUES,
  TITLE_VALUES,
  TZ_VALUES,
  WEEKS_VALUES,
  type CalendarFeedOptions,
} from "@/lib/calendar-feed/options";
import { SectionHeading, selectClass } from "./shared";

/**
 * Every knob the feed URL carries, as a grid of selects.
 *
 * The options are on the URL rather than in a stored preference precisely so
 * they can be compared — an owner subscribes one client to one URL and another
 * to another and looks at what each does — so this panel's whole job is to make
 * producing a differing URL a matter of seconds.
 */

/** One seat-holder the per-gamer scope may narrow to, from either source. */
export interface ScopeChoice {
  participantId: string;
  firstName: string;
}

/**
 * One option, as a select over a fixed value list.
 *
 * Generic in the *value* rather than in the option key, which is what keeps it
 * free of casts: `values` fixes `V`, `findOption` narrows the browser's plain
 * string back to it, and `onPick` receives the union the caller's option field
 * is already declared as. A helper generic in the key would have to widen to
 * string somewhere in the middle and assert its way back.
 */
function EnumField<V extends string>({
  id,
  label,
  value,
  values,
  optionLabel,
  onPick,
}: {
  id: string;
  label: string;
  value: V;
  values: readonly V[];
  optionLabel: (value: V) => string;
  onPick: (value: V) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(event) => {
          const picked = findOption(values, event.target.value);
          if (picked !== undefined) onPick(picked);
        }}
      >
        {values.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </Field>
  );
}

interface FeedOptionsProps {
  options: CalendarFeedOptions;
  onChange: <K extends keyof CalendarFeedOptions>(
    key: K,
    value: CalendarFeedOptions[K],
  ) => void;
  /** Empty until a source has resolved, which is what disables the scope select. */
  scopeChoices: readonly ScopeChoice[];
}

export function FeedOptions({
  options,
  onChange,
  scopeChoices,
}: FeedOptionsProps) {
  const t = useTranslations("admin.testing.calendarFeed");

  return (
    <div className="space-y-3">
      <SectionHeading>{t("optionsHeading")}</SectionHeading>
      {/* Admin surfaces are desktop-default, so the knobs use the width. */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <EnumField
          id="calendar-feed-mode"
          label={t("modeLabel")}
          value={options.mode}
          values={MODE_VALUES}
          optionLabel={(value) => t(`modeOptions.${value}`)}
          onPick={(value) => onChange("mode", value)}
        />
        <EnumField
          id="calendar-feed-title"
          label={t("titleLabel")}
          value={options.title}
          values={TITLE_VALUES}
          optionLabel={(value) => t(`titleOptions.${value}`)}
          onPick={(value) => onChange("title", value)}
        />
        <EnumField
          id="calendar-feed-alarm"
          label={t("alarmLabel")}
          value={options.alarm}
          values={ALARM_VALUES}
          optionLabel={(value) => t(`alarmOptions.${value}`)}
          onPick={(value) => onChange("alarm", value)}
        />
        <EnumField
          id="calendar-feed-tz"
          label={t("tzLabel")}
          value={options.tz}
          values={TZ_VALUES}
          optionLabel={(value) => t(`tzOptions.${value}`)}
          onPick={(value) => onChange("tz", value)}
        />
        <EnumField
          id="calendar-feed-weeks"
          label={t("weeksLabel")}
          value={options.weeks}
          values={WEEKS_VALUES}
          optionLabel={(value) => t("weeksOption", { weeks: value })}
          onPick={(value) => onChange("weeks", value)}
        />

        <Field label={t("scopeLabel")} htmlFor="calendar-feed-scope">
          <select
            id="calendar-feed-scope"
            className={selectClass}
            disabled={scopeChoices.length === 0}
            value={options.scope}
            onChange={(event) => onChange("scope", event.target.value)}
          >
            <option value={CALENDAR_FEED_DEFAULTS.scope}>
              {t("scopeFamily")}
            </option>
            {scopeChoices.map((gamer) => (
              <option
                key={gamer.participantId}
                value={`gamer:${gamer.participantId}`}
              >
                {gamer.firstName}
              </option>
            ))}
          </select>
        </Field>

        <EnumField
          id="calendar-feed-details"
          label={t("detailsLabel")}
          value={options.details}
          values={DETAILS_VALUES}
          optionLabel={(value) => t(`detailsOptions.${value}`)}
          onPick={(value) => onChange("details", value)}
        />
        <EnumField
          id="calendar-feed-busy"
          label={t("busyLabel")}
          value={options.busy}
          values={BUSY_VALUES}
          optionLabel={(value) => t(`busyOptions.${value}`)}
          onPick={(value) => onChange("busy", value)}
        />
        <EnumField
          id="calendar-feed-method"
          label={t("methodLabel")}
          value={options.method}
          values={METHOD_VALUES}
          optionLabel={(value) => t(`methodOptions.${value}`)}
          onPick={(value) => onChange("method", value)}
        />
        <EnumField
          id="calendar-feed-refresh"
          label={t("refreshLabel")}
          value={options.refresh}
          values={REFRESH_VALUES}
          optionLabel={(value) => t(`refreshOptions.${value}`)}
          onPick={(value) => onChange("refresh", value)}
        />
        <EnumField
          id="calendar-feed-color"
          label={t("colorLabel")}
          value={options.color}
          values={COLOR_VALUES}
          optionLabel={(value) => t(`colorOptions.${value}`)}
          onPick={(value) => onChange("color", value)}
        />

        <Field label={t("calnameLabel")} htmlFor="calendar-feed-calname">
          <Input
            id="calendar-feed-calname"
            value={options.calname}
            maxLength={CALNAME_MAX_LENGTH}
            onChange={(event) => onChange("calname", event.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}
