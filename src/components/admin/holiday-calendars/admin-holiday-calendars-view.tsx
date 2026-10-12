"use client";

import { useHolidayCalendars } from "@/services/holiday-calendars";
import { AdminHolidayCalendarsPage } from "./admin-holiday-calendars-page";
import { useViewerToday } from "./use-viewer-today";

/** The live data shell for `/admin/holiday-calendars`. */
export function AdminHolidayCalendarsView() {
  const { data, isPending } = useHolidayCalendars();
  const today = useViewerToday();

  return (
    <AdminHolidayCalendarsPage
      calendars={data ?? []}
      settled={!isPending}
      today={today}
    />
  );
}
