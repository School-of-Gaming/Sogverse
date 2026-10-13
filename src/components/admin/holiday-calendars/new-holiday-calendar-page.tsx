"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { useCreateHolidayCalendar } from "@/services/holiday-calendars";
import { emptyHolidayCalendarDraft } from "./holiday-calendar-draft";
import { HolidayCalendarForm } from "./holiday-calendar-form";
import { HolidayCalendarPageShell } from "./holiday-calendar-page-shell";
import { useViewerToday } from "./use-viewer-today";

/**
 * `/admin/holiday-calendars/new` — the data shell around the create form. A
 * new calendar is followed by no club, so it saves without a preview.
 */
export function NewHolidayCalendarPage() {
  const t = useTranslations("admin.holidayCalendars");
  const router = useRouter();
  const uiLocale = resolveLocale(useLocale());
  const today = useViewerToday();
  const createCalendar = useCreateHolidayCalendar();

  return (
    <HolidayCalendarPageShell title={t("newPage.title")}>
      <HolidayCalendarForm
        initialDraft={emptyHolidayCalendarDraft(uiLocale)}
        submitLabel={t("newPage.submit")}
        today={today}
        onCancel={() => router.push(ROUTES.admin.holidayCalendars)}
        onSubmit={async (input) => {
          await createCalendar.mutateAsync(input);
          router.push(ROUTES.admin.holidayCalendars);
        }}
      />
    </HolidayCalendarPageShell>
  );
}
