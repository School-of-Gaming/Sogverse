"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * The chrome both calendar forms sit in: the way back to the list, the page's
 * title, and whatever is being asked underneath. Nothing in it waits on a read.
 */
export function HolidayCalendarPageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.holidayCalendars");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={ROUTES.admin.holidayCalendars}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToList")}
      </Link>

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>

      {children}
    </div>
  );
}
