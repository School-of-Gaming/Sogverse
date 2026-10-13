import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewHolidayCalendarPage } from "@/components/admin/holiday-calendars/new-holiday-calendar-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminHolidayCalendarNew") };
}

export default function NewHolidayCalendarRoute() {
  return <NewHolidayCalendarPage />;
}
