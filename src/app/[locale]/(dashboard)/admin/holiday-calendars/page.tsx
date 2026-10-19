import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminHub } from "@/components/admin/hubs/admin-hub";
import { AddHolidayCalendarAction } from "@/components/admin/holiday-calendars/admin-holiday-calendars-page";
import { AdminHolidayCalendarsView } from "@/components/admin/holiday-calendars/admin-holiday-calendars-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminHolidayCalendars") };
}

export default async function HolidayCalendarsPage() {
  const t = await getTranslations("admin.holidayCalendars");

  return (
    <AdminHub
      hub="products"
      description={t("subtitle")}
      action={<AddHolidayCalendarAction />}
    >
      <AdminHolidayCalendarsView />
    </AdminHub>
  );
}
