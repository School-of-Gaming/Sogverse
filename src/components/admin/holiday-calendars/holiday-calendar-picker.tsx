"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Field } from "@/components/ui/field";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { breakName } from "@/lib/holiday-breaks";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { formatDateRange } from "@/lib/utils";
import { useHolidayCalendars } from "@/services/holiday-calendars";
import { nextBreak } from "./admin-holiday-calendars-page";

/**
 * Which holiday calendars a club follows: one row per calendar, ticked for the
 * ones the club pauses for.
 *
 * **Mounted only for the two club types**, which is also what keeps the list
 * read off every camp and event form: the database refuses a calendar on any
 * other type, so a picker there would ask a question with no answer it could
 * save.
 *
 * **Each row names the calendar and its next break**, measured from `today` —
 * the club's own today, since a break is a bare date range read in the club's
 * zone. The name alone is how an admin finds a calendar; the next break is how
 * they check it is the one they meant before saving.
 *
 * **Following none is the resting state and needs no row of its own**: an
 * empty selection is a club with no breaks, which is what every club was
 * before calendars existed.
 *
 * **The rows arrive with the list**, a handful of calendars read by one small
 * walk that lands in a frame or two, so nothing is drawn in their place. The
 * sections below the schedule move down by the rows' height when they land;
 * that is accepted rather than reserved for, because the count is unknown until
 * the read answers and a guessed reservation would leave a hole or still shift.
 * A first read that failed says so in place of the rows, and leaves the
 * selection in form state untouched, so a save made anyway keeps the calendars
 * the club already follows.
 */
export function HolidayCalendarPicker({
  value,
  onChange,
  today,
}: {
  /** The followed calendars' ids, in the order they were picked. */
  value: readonly string[];
  onChange: (holidayCalendarIds: string[]) => void;
  /** Today as `YYYY-MM-DD` in the club's own zone. */
  today: string;
}) {
  const t = useTranslations("admin.products.holidayCalendars");
  const locale = resolveLocale(useLocale());
  const { data: calendars, isError } = useHolidayCalendars();

  // Having answered once, the list stays answered: a failed background refetch
  // keeps the cached rows, so only a failure with nothing cached is reported.
  const listUnavailable = isError && calendars === undefined;
  const selected = new Set(value);

  const toggle = (id: string, next: boolean) =>
    onChange(
      next ? [...value.filter((v) => v !== id), id] : value.filter((v) => v !== id),
    );

  return (
    <Field
      label={t("label")}
      hint={t("hint")}
      labelAction={
        <Link
          href={ROUTES.admin.holidayCalendars}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("manage")}
        </Link>
      }
    >
      {calendars !== undefined && calendars.length > 0 && (
        <div className="space-y-2">
          {calendars.map((calendar) => {
            const next = nextBreak(calendar.breaks, today);
            return (
              <CheckboxRow
                key={calendar.id}
                checked={selected.has(calendar.id)}
                onCheckedChange={(checked) => toggle(calendar.id, checked)}
                title={calendar.name}
                label={
                  next === null
                    ? t("noUpcomingBreak")
                    : t("nextBreak", {
                        name: breakName({ names: inLocaleOrder(next.names) }, locale),
                        dates: formatDateRange(next.startDate, next.endDate, locale),
                      })
                }
              />
            );
          })}
        </div>
      )}
      {calendars !== undefined && calendars.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
      {listUnavailable && (
        <p className="text-sm text-destructive">
          {t("listUnavailable")}
        </p>
      )}
    </Field>
  );
}
