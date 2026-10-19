"use client";

import { useLocale, useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCompactDateRange } from "@/lib/date-format";
import type { HolidayImpactSummary } from "./holiday-calendar-impact";

/**
 * The confirm step before a calendar save that changes some club: each
 * affected club by name, and under it what its families will experience —
 * sessions gone or back, to come and past, written-up sessions hidden or
 * shown — plus the substitution requests that lose or regain their session.
 * Only what is not zero is said.
 *
 * Holds while committing: the save is live and its refusal is something the
 * admin has to read before doing anything else, so it is drawn inside the
 * dialog rather than behind it.
 */
export function HolidayCalendarImpactDialog({
  open,
  onOpenChange,
  impacts,
  onConfirm,
  describeError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ordered by club name; never empty while open. */
  impacts: readonly HolidayImpactSummary[];
  /** The save. Resolves once the page behind can be looked at again. */
  onConfirm: () => Promise<void>;
  describeError: (error: unknown) => string;
}) {
  const t = useTranslations("admin.holidayCalendars.impact");
  const c = useTranslations("common");
  const locale = useLocale();

  // Each date carries its year when that is not the club's current year: an
  // edit can reach a past term or one years ahead, and "3 Mar" alone does not
  // say which.
  const dates = (list: readonly string[], today: string) =>
    list.map((date) => formatCompactDateRange(date, date, locale, today)).join(", ");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description", { count: impacts.length })}
      confirmLabel={c("saveChanges")}
      confirmVariant="default"
      holdWhileCommitting
      onConfirm={onConfirm}
      describeError={describeError}
    >
      <ul className="max-h-[50vh] space-y-4 overflow-y-auto text-sm">
        {impacts.map((impact) => (
          <li key={impact.productId} className="space-y-1">
            <p className="font-medium">{impact.name}</p>
            <ul className="space-y-1 text-muted-foreground">
              {impact.futureRemoved.length > 0 && (
                <li>
                  {t("futureRemoved", {
                    count: impact.futureRemoved.length,
                    dates: dates(impact.futureRemoved, impact.today),
                  })}
                </li>
              )}
              {impact.futureRestored.length > 0 && (
                <li>
                  {t("futureRestored", {
                    count: impact.futureRestored.length,
                    dates: dates(impact.futureRestored, impact.today),
                  })}
                </li>
              )}
              {impact.pastRemoved.length > 0 && (
                <li>
                  {t("pastRemoved", {
                    count: impact.pastRemoved.length,
                    dates: dates(impact.pastRemoved, impact.today),
                  })}
                </li>
              )}
              {impact.pastRestored.length > 0 && (
                <li>
                  {t("pastRestored", {
                    count: impact.pastRestored.length,
                    dates: dates(impact.pastRestored, impact.today),
                  })}
                </li>
              )}
              {impact.recordsHidden > 0 && (
                <li>{t("recordsHidden", { count: impact.recordsHidden })}</li>
              )}
              {impact.recordsShown > 0 && (
                <li>{t("recordsShown", { count: impact.recordsShown })}</li>
              )}
              {impact.requestsStopped > 0 && (
                <li>{t("requestsStopped", { count: impact.requestsStopped })}</li>
              )}
              {impact.requestsReopened > 0 && (
                <li>{t("requestsReopened", { count: impact.requestsReopened })}</li>
              )}
            </ul>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}
