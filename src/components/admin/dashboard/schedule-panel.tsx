/* eslint-disable i18next/no-literal-string -- design-mock phase; see the note on
   `product-attention-grid.tsx`. */
"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProductType } from "@/types";
import type { ComingUpDay, ScheduleWeek } from "./admin-dashboard-data";
import { addCalendarDays, formatDayMonth } from "./calendar";
import { ComingUpFeed } from "./coming-up-feed";
import {
  PRODUCT_TYPE_ORDER,
  PRODUCT_TYPE_PRESENTATION,
} from "./product-type-presentation";
import { WeekRows } from "./week-rows";

/**
 * The bottom of the dashboard: this week in detail, and the coming months in
 * outline, one under the other.
 *
 * They were two tabs and are not any more. A tab is right when two views compete
 * for the same space and only one is wanted at a time; these two do not compete
 * — "what is on this week" is seven rows and "what is lined up" is a short dated
 * list — and a tab was charging a click for something that fits underneath. It
 * also hid the coming-up half from anyone who never thought to look for it,
 * which for a planning aid is close to deleting it.
 *
 * Everything here is local state over data already in the page, so a filter chip
 * and a week step reflow immediately with nothing to wait for.
 */
export function SchedulePanel({
  weeks,
  currentWeekIndex,
  comingUp,
  now,
  timeZone,
}: {
  weeks: readonly ScheduleWeek[];
  currentWeekIndex: number;
  comingUp: readonly ComingUpDay[];
  now: Date;
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Schedule</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        <ThisWeek weeks={weeks} currentWeekIndex={currentWeekIndex} now={now} timeZone={timeZone} />

        <section aria-label="Coming up" className="space-y-3 border-t border-border pt-6">
          <h3 className="text-sm font-semibold">Coming up</h3>
          <ComingUpFeed days={comingUp} />
        </section>
      </CardContent>
    </Card>
  );
}

function ThisWeek({
  weeks,
  currentWeekIndex,
  now,
  timeZone,
}: {
  weeks: readonly ScheduleWeek[];
  currentWeekIndex: number;
  now: Date;
  timeZone: string;
}) {
  const [weekIndex, setWeekIndex] = useState(currentWeekIndex);
  // Off means "not filtering by this axis", so the resting page shows
  // everything. An empty set reading as "all" rather than "none" is the only
  // behaviour that lets a chip row start with nothing lit.
  //
  // Type is the only axis. Status used to be a second row of chips and was
  // removed with the rest of the status display: filtering a week by "running"
  // selects every chip in it, because a chip in a week *is* something running.
  const [types, setTypes] = useState<ReadonlySet<ProductType>>(new Set());

  const week = weeks[weekIndex];
  const todayIso = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const weekEnd = addCalendarDays(week.weekStart, 6);

  const filtered: ScheduleWeek = {
    ...week,
    chips: week.chips.filter(
      (chip) => types.size === 0 || types.has(chip.productType),
    ),
  };

  return (
    <section aria-label="This week" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekIndex(Math.max(weekIndex - 1, 0))}
            disabled={weekIndex === 0}
            aria-label="Previous week"
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setWeekIndex(currentWeekIndex)}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() =>
              setWeekIndex(Math.min(weekIndex + 1, weeks.length - 1))
            }
            disabled={weekIndex === weeks.length - 1}
            aria-label="Next week"
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <span className="ml-2 text-sm font-medium tabular-nums">
            {formatDayMonth(week.weekStart)} &ndash; {formatDayMonth(weekEnd)}
            {week.weekStart.slice(0, 4)}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            {filtered.chips.length} sessions
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRODUCT_TYPE_ORDER.map((productType) => {
            const presentation = PRODUCT_TYPE_PRESENTATION[productType];
            const Icon = presentation.icon;
            const active = types.has(productType);
            return (
              <button
                key={productType}
                type="button"
                aria-pressed={active}
                onClick={() => setTypes(toggled(types, productType))}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-foreground/40 bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {/* The same tinted glyph the chips below wear, so the control
                    and the thing it filters are visibly the same vocabulary. */}
                <Icon
                  className={cn("h-3.5 w-3.5", presentation.text)}
                  aria-hidden
                />
                {presentation.plural}
              </button>
            );
          })}
        </div>
      </div>

      <WeekRows
        week={filtered}
        todayIso={
          week.weekStart <= todayIso && todayIso <= weekEnd ? todayIso : null
        }
      />
    </section>
  );
}

function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}
