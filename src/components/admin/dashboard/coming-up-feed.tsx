/* eslint-disable i18next/no-literal-string -- design-mock phase; see the note on
   `product-attention-grid.tsx`. */
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ComingUpCohort,
  ComingUpDay,
  ComingUpItem,
} from "./admin-dashboard-data";
import { formatDayMonth, formatMonth, weekdayOf, WEEKDAY_LABELS } from "./calendar";
import { PRODUCT_TYPE_PRESENTATION } from "./product-type-presentation";

/**
 * What is lined up over the coming months: one dated line per thing that starts
 * or ends, oldest first.
 *
 * It replaces two competing "Coming months" designs — a four-month timeline of
 * bars and a month-grouped list — and it exists because both of them lost to the
 * same fact about the data. A term does not trickle: forty-odd clubs start on
 * one Monday and end on one Friday. The timeline drew that as forty-odd
 * identical bars stacked into a wall, and the list drew it as forty-odd rows
 * under a single month heading; in both, the camp starting the following week —
 * the one thing an admin could still act on — was buried under it.
 *
 * So the unit here is the **date**, and everything of one kind on one date is a
 * cohort. A cohort of a few lists its members, because three lines are quicker
 * to read than a line you have to open. A cohort of many collapses to one
 * counted line with an expander, which turns a term boundary into what it
 * actually is — a single event — without hiding which products it covers.
 */

/**
 * Above this many members, a cohort is one counted line instead of a list.
 *
 * Three, because two members are already shorter written out than the summary
 * line plus the two rows you get after opening it, and because the cases this
 * feed exists to compress are twenty and forty rather than four.
 */
const COHORT_COLLAPSE_AT = 3;

export function ComingUpFeed({ days }: { days: readonly ComingUpDay[] }) {
  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing starts or ends over the coming months.
      </p>
    );
  }

  // Derived up front rather than accumulated while mapping: a variable
  // reassigned inside a render's callback is state the compiler cannot reason
  // about, and comparing against the previous element says the same thing
  // without any.
  const rows = days.map((day, index) => ({
    day,
    month: formatMonth(day.date),
    startsMonth:
      index === 0 || formatMonth(days[index - 1].date) !== formatMonth(day.date),
  }));

  return (
    <ul className="space-y-1">
      {rows.map(({ day, month, startsMonth }) => (
        <li key={day.date}>
          {/* A month heading only where the month changes. Over three-odd months
              of scattered dates the reader otherwise has to hold "which month am
              I in" from the last row that happened to spell it out. */}
          {startsMonth && (
            <p className="mb-1 mt-4 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
              {month}
            </p>
          )}
          <DayRow day={day} />
        </li>
      ))}
    </ul>
  );
}

function DayRow({ day }: { day: ComingUpDay }) {
  return (
    <div className="flex flex-col gap-1 py-1 sm:flex-row sm:gap-3">
      <p className="shrink-0 text-xs font-medium tabular-nums sm:w-24">
        {WEEKDAY_LABELS[weekdayOf(day.date)]} {formatDayMonth(day.date)}
      </p>
      <ul className="min-w-0 flex-1 space-y-1">
        {day.cohorts.map((cohort) => (
          <li key={cohort.id}>
            <Cohort cohort={cohort} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Plural verb for a counted cohort line, singular for a row about one product.
 *
 * No icon: the kind is a *word* here, and the only glyph on these rows is the
 * type glyph. An icon per kind was tried and one of the three was `CalendarDays`
 * — which is the event type's own mark — so a single-date event line wore the
 * same glyph twice meaning two different things.
 */
const KIND_VERBS: Record<
  ComingUpCohort["kind"],
  { plural: string; singular: string }
> = {
  starts: { plural: "start", singular: "starts" },
  runs: { plural: "run", singular: "runs" },
  ends: { plural: "end", singular: "ends" },
};

function Cohort({ cohort }: { cohort: ComingUpCohort }) {
  const [open, setOpen] = useState(false);
  const presentation = PRODUCT_TYPE_PRESENTATION[cohort.productType];
  const Icon = presentation.icon;
  const verbs = KIND_VERBS[cohort.kind];

  if (cohort.items.length < COHORT_COLLAPSE_AT) {
    return (
      <ul className="space-y-1">
        {cohort.items.map((item) => (
          <li key={item.id}>
            <ItemRow item={item} cohort={cohort} verb={verbs.singular} />
          </li>
        ))}
      </ul>
    );
  }

  const noun =
    cohort.items.length === 1 ? presentation.label : presentation.plural;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm transition-colors hover:bg-accent"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <Icon
          className={cn("h-3.5 w-3.5 shrink-0", presentation.text)}
          aria-hidden
        />
        <span className="font-medium">
          {cohort.items.length} {noun.toLowerCase()} {verbs.plural}
        </span>
      </button>
      {open && (
        <ul className="ml-6 space-y-1 border-l border-border pl-3">
          {cohort.items.map((item) => (
            <li key={item.id}>
              <ItemRow item={item} cohort={cohort} verb={null} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemRow({
  item,
  cohort,
  /** The verb, when the row stands alone; `null` inside an opened cohort, whose
   *  heading has already said it once for every row under it. */
  verb,
}: {
  item: ComingUpItem;
  cohort: ComingUpCohort;
  verb: string | null;
}) {
  const presentation = PRODUCT_TYPE_PRESENTATION[cohort.productType];
  const Icon = presentation.icon;

  return (
    <Link
      href={item.href}
      title={`${presentation.label} · ${item.name}`}
      className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent"
    >
      <Icon
        className={cn("h-3.5 w-3.5 shrink-0", presentation.text)}
        aria-hidden
      />
      <span className="min-w-0 flex-1 text-sm">
        {item.name}
        {verb !== null && (
          <span className="text-muted-foreground"> {verb}</span>
        )}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {item.seatCount === null
          ? item.activeCount
          : `${item.activeCount}/${item.seatCount}`}
      </span>
    </Link>
  );
}
