import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditHolidayCalendarPage } from "@/components/admin/holiday-calendars/edit-holiday-calendar-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminHolidayCalendarEdit") };
}

export default async function HolidayCalendarRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditHolidayCalendarPage calendarId={id} />;
}
