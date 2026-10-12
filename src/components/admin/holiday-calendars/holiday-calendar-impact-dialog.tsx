"use client";

import { useLocale, useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDateOnly } from "@/lib/utils";
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

  const dates = (list: readonly string[]) =>
    list
      .map((date) => formatDateOnly(date, locale, { day: "numeric", month: "short" }))
      .join(", ");

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
                    dates: dates(impact.futureRemoved),
                  })}
                </li>
              )}
              {impact.futureRestored.length > 0 && (
                <li>
                  {t("futureRestored", {
                    count: impact.futureRestored.length,
                    dates: dates(impact.futureRestored),
                  })}
                </li>
              )}
              {impact.pastRemoved.length > 0 && (
                <li>
                  {t("pastRemoved", {
                    count: impact.pastRemoved.length,
                    dates: dates(impact.pastRemoved),
                  })}
                </li>
              )}
              {impact.pastRestored.length > 0 && (
                <li>
                  {t("pastRestored", {
                    count: impact.pastRestored.length,
                    dates: dates(impact.pastRestored),
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
