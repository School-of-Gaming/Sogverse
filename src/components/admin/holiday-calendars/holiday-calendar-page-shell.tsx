"use client";

import { ArrowLeft } from "lucide-react";
import { Heading } from "@sog/ui";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";

/**
 * The chrome both calendar forms sit in: the way back to the list, the page's
 * title, and whatever is being asked underneath. Nothing in it waits on a read.
 * A plain form's width: the breaks are a list of lines, and a break is edited
 * in its own dialog.
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
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={ROUTES.admin.holidayCalendars}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToList")}
      </Link>

      <Heading level={1} step="section">{title}</Heading>

      {children}
    </div>
  );
}
