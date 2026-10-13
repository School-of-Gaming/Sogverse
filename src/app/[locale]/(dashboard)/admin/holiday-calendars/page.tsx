import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminHub } from "@/components/admin/hubs/admin-hub";
import { AdminHolidayCalendarsView } from "@/components/admin/holiday-calendars/admin-holiday-calendars-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminHolidayCalendars") };
}

export default function HolidayCalendarsPage() {
  return (
    <AdminHub hub="products">
      <AdminHolidayCalendarsView />
    </AdminHub>
  );
}
