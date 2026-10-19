"use client";

import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { ROUTES } from "@/lib/constants/routes";
import { resolveLocale } from "@/lib/constants/locales";
import { breakName } from "@/lib/holiday-breaks";
import { formatDateRange } from "@/lib/date-format";
import type {
  HolidayCalendarBreak,
  HolidayCalendarSummary,
} from "@/services/holiday-calendars/holiday-calendars.service";

/**
 * The break a calendar's row names as its next: the first, soonest first,
 * that has not ended by `today` — so a break under way is still the one named.
 */
export function nextBreak(
  breaks: readonly HolidayCalendarBreak[],
  today: string,
): HolidayCalendarBreak | null {
  return breaks.find((entry) => entry.endDate >= today) ?? null;
}

/**
 * Every holiday calendar, one row each: its name, how many breaks it holds,
 * the next one, and how many clubs follow it.
 *
 * **Presentational**: the rows arrive as a prop from the live data shell
 * beside it, and `settled` is separate from them because "no calendars yet"
 * and "the read has not answered" are different pages. No loading affordance:
 * a handful of calendars read by one indexed walk lands in a frame or two
 * beneath chrome and column headers already at their final size.
 *
 * **The whole row opens the calendar**, through the stretched-link shape the
 * invoice customers table uses: the name is the anchor and its `::after`
 * covers the row.
 */
export function AdminHolidayCalendarsPage({
  calendars,
  settled,
  today,
}: {
  /** In the order the read delivers: by name, then id. */
  calendars: readonly HolidayCalendarSummary[];
  /** Whether the read has answered. Only then may the empty state appear. */
  settled: boolean;
  /** Today in the viewer's zone, which "next" is measured from. */
  today: string;
}) {
  const t = useTranslations("admin.holidayCalendars");
  const locale = resolveLocale(useLocale());

  return (
    <Card>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.name")}
                </th>
                <th scope="col" className="w-24 px-3 py-2 font-medium">
                  {t("columns.breaks")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.nextBreak")}
                </th>
                <th scope="col" className="w-24 px-3 py-2 font-medium">
                  {t("columns.clubs")}
                </th>
                {/* The chevron's column, unlabelled: it holds a decorative
                    mark rather than data. */}
                <th scope="col" className="w-8 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {calendars.map((calendar) => {
                const next = nextBreak(calendar.breaks, today);
                return (
                  <tr
                    key={calendar.id}
                    className="group relative border-b border-border transition-colors last:border-b-0 hover:bg-hover focus-within:bg-lifted"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={ROUTES.admin.holidayCalendar(calendar.id)}
                        className="rounded font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
                      >
                        {calendar.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {calendar.breaks.length}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {next === null ? (
                        t("noUpcomingBreak")
                      ) : (
                        <>
                          <span className="text-foreground">
                            {breakName(next, locale)}
                          </span>{" "}
                          {formatDateRange(next.startDate, next.endDate, locale)}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {calendar.productCount}
                    </td>
                    <td className="w-8 px-3 py-2">
                      <NavChevron size="sm" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {settled && calendars.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** The page's create control, the hub's `action`. */
export function AddHolidayCalendarAction() {
  const t = useTranslations("admin.holidayCalendars");

  return (
    <Link
      href={ROUTES.admin.holidayCalendarNew}
      className={buttonVariants({ className: "gap-1.5" })}
    >
      <Plus className="h-4 w-4" />
      {t("addCalendar")}
    </Link>
  );
}
