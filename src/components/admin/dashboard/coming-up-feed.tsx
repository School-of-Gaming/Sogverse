"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn, formatDateOnly } from "@/lib/utils";
import type {
  ComingUpCohort,
  ComingUpDay,
  ComingUpItem,
} from "./admin-dashboard-data";
import { formatDayMonth } from "./calendar";
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
  const t = useTranslations("admin.dashboard.comingUp");
  const locale = useLocale();

  if (days.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  // Derived up front rather than accumulated while mapping: a variable
  // reassigned inside a render's callback is state the compiler cannot reason
  // about, and comparing against the previous element says the same thing
  // without any. The comparison is on the bare `YYYY-MM` rather than on the
  // rendered heading, so it does not depend on how a locale words a month.
  const rows = days.map((day, index) => ({
    day,
    // A month name is date formatting, so it comes from `Intl` in the reader's
    // locale rather than out of a label array.
    month: formatDateOnly(day.date, locale, {
      month: "long",
      year: "numeric",
    }),
    startsMonth:
      index === 0 || days[index - 1].date.slice(0, 7) !== day.date.slice(0, 7),
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
  const locale = useLocale();

  return (
    <div className="flex flex-col gap-1 py-1 sm:flex-row sm:gap-3">
      <p className="shrink-0 text-xs font-medium tabular-nums sm:w-24">
        {formatDateOnly(day.date, locale, { weekday: "short" })}{" "}
        {formatDayMonth(day.date)}
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
 * The counted cohort line — "five municipality clubs start" — is **one message
 * per kind and product type**, not a count plus a noun plus a verb assembled
 * here.
 *
 * Assembling it is what English makes look free: everywhere else the noun's form
 * depends on the count *and* on the verb it governs (Finnish counts things in
 * the partitive, and the verb then stays singular), so three interchangeable
 * pieces produce a sentence no reviewer would sign off. Twelve whole sentences
 * cost twelve keys and are twelve things a translator can actually read.
 *
 * No icon per kind: the kind is a *word* here, and the only glyph on these rows
 * is the type glyph. An icon per kind was tried and one of the three was
 * `CalendarDays` — which is the event type's own mark — so a single-date event
 * line wore the same glyph twice meaning two different things.
 */
function Cohort({ cohort }: { cohort: ComingUpCohort }) {
  const t = useTranslations("admin.dashboard.comingUp");
  const [open, setOpen] = useState(false);
  const presentation = PRODUCT_TYPE_PRESENTATION[cohort.productType];
  const Icon = presentation.icon;

  if (cohort.items.length < COHORT_COLLAPSE_AT) {
    return (
      <ul className="space-y-1">
        {cohort.items.map((item) => (
          <li key={item.id}>
            <ItemRow
              item={item}
              cohort={cohort}
              verb={t(`itemVerb.${cohort.kind}`)}
            />
          </li>
        ))}
      </ul>
    );
  }

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
          {t(`cohort.${cohort.kind}.${presentation.i18nKey}`, {
            count: cohort.items.length,
          })}
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
  const tType = useTranslations("admin.products.types");
  const presentation = PRODUCT_TYPE_PRESENTATION[cohort.productType];
  const Icon = presentation.icon;
  const title = `${tType(`${presentation.i18nKey}.label`)} · ${item.name}`;

  return (
    <Link
      href={item.href}
      title={title}
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
