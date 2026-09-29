"use client";

import type { ComponentProps, ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { monthsAfter } from "@/lib/calendar-date";
import { cn, formatDateOnly } from "@/lib/utils";

/** A link target the app's own typed `Link` accepts. */
export type MonthHref = ComponentProps<typeof Link>["href"];

/**
 * Previous month, the month's own name, next month — the same three-control
 * shape the dashboard's week stepper uses, with the label between the arrows
 * that move it, and navigating by link rather than by state because an
 * invoicing month is a URL.
 *
 * The month is named by `Intl` rather than by a message key: "syyskuu 2026" and
 * "September 2026" are a date format, not a sentence, and a catalogue of twelve
 * month names per locale is a table `Intl` already ships.
 *
 * **Where a step goes is the caller's.** Each invoicing page points it at
 * another month of itself, and a preview scene points it back at the scene — a
 * stepper that left the preview would be the one control on it a reviewer
 * could not use twice.
 */
export function MonthStepper({
  monthStart,
  locale,
  monthHref,
  previousLabel,
  nextLabel,
}: {
  /** The month on screen, as its first day (`YYYY-MM-01`). */
  monthStart: string;
  locale: string;
  /** Where a step goes, given the month (`YYYY-MM`) it steps to. */
  monthHref: (month: string) => MonthHref;
  previousLabel: string;
  nextLabel: string;
}) {
  const previous = monthsAfter(monthStart, -1).slice(0, 7);
  const next = monthsAfter(monthStart, 1).slice(0, 7);

  return (
    <div className="flex items-center gap-2">
      <MonthLink href={monthHref(previous)} label={previousLabel}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </MonthLink>
      {/* Between its two controls, where the thing being stepped belongs: a
          label to one side of both arrows reads as a caption on the pair rather
          than as the value they move. */}
      <MonthLabel monthStart={monthStart} locale={locale} />

      <MonthLink href={monthHref(next)} label={nextLabel}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </MonthLink>
    </div>
  );
}

/**
 * The month's name, as wide as the widest month of its year.
 *
 * All twelve names share one grid cell and only the current one is visible, so
 * the cell is sized by the longest name in the reader's own locale and the next
 * arrow stays put while the reader clicks it — "May 2026" and "September 2026"
 * would otherwise move it by a word's width on every step.
 */
function MonthLabel({
  monthStart,
  locale,
}: {
  monthStart: string;
  locale: string;
}) {
  const yearStart = `${monthStart.slice(0, 4)}-01-01`;

  return (
    <span className="grid text-center text-sm font-medium tabular-nums">
      {Array.from({ length: 12 }, (_, index) => {
        const month = monthsAfter(yearStart, index);
        const isCurrent = month === monthStart;
        return (
          <span
            key={month}
            aria-hidden={isCurrent ? undefined : true}
            className={cn(
              "col-start-1 row-start-1 whitespace-nowrap",
              !isCurrent && "invisible",
            )}
          >
            {formatDateOnly(month, locale, { month: "long", year: "numeric" })}
          </span>
        );
      })}
    </span>
  );
}

function MonthLink({
  href,
  label,
  children,
}: {
  href: MonthHref;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
    >
      {children}
    </Link>
  );
}
