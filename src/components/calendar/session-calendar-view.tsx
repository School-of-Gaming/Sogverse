"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  iterateMonthStarts,
  schemaWeekdayFromDateString,
  type SessionDate,
  type SkippedSessionDate,
} from "./compute-product-sessions";

// Mini-month grids in a horizontal snap-scroller. Pure presentational —
// takes pre-computed session and skip arrays so a UI Components mock can
// render any state without faking schedule slots / holidays.
//
// Visual rules:
//  - Months scroll horizontally with snap-stops; the next month always
//    peeks past the right edge so users see there's more to scroll.
//    Inline padding on the scroller gives breathing room at scrollLeft=0
//    so the leftmost tile's outline doesn't kiss the card's content edge.
//  - Each month is its own 7-column grid (Mon-first per Finnish convention).
//  - Session dates are filled circles tinted with the primary color.
//  - Skipped dates are an outlined circle with a strikethrough number.
//  - A small caption under each grid lists the month's skip reasons
//    (deduped) so reasons stay readable on mobile without a tap.
//  - Today gets a thin ring; matters when the term is in progress.
//
// Reusable later for: parent's-all-products dashboard calendar, browse-
// by-calendar surface. Keep the API tight — only what this details page
// needs. New use cases extend from here, don't fork.

export interface SessionCalendarViewProps {
  rangeStart: string; // YYYY-MM-01
  rangeEnd: string; // YYYY-MM-01
  sessions: SessionDate[];
  skips: SkippedSessionDate[];
  locale: string;
  /**
   * Reference "today" for highlighting. Pass YYYY-MM-DD; if absent the
   * calendar renders with no today-marker (useful for SSR / mocks).
   */
  todayIso?: string;
}

export function SessionCalendarView({
  rangeStart,
  rangeEnd,
  sessions,
  skips,
  locale,
  todayIso,
}: SessionCalendarViewProps) {
  const sessionSet = new Set(sessions.map((s) => s.date));
  const skipMap = new Map<string, string>();
  for (const s of skips) skipMap.set(s.date, s.reason);

  const months = Array.from(iterateMonthStarts(rangeStart, rangeEnd));

  return (
    <div className="space-y-5">
      <Legend />
      <div className="relative">
        {/* `scroll-px-3` on the scroller mirrors `px-3` so snap-start
            aligns with the content edge — without it `snap-mandatory`
            anchors children to the padding-box edge and the scrollbar
            thumb sits slightly off-leftmost even at scrollLeft=0. */}
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-3 pb-2 scroll-px-3">
          {months.map((monthStart) => (
            <div
              key={monthStart}
              className="flex w-[260px] shrink-0 snap-start"
            >
              <MonthGrid
                monthStart={monthStart}
                sessionSet={sessionSet}
                skipMap={skipMap}
                locale={locale}
                todayIso={todayIso}
              />
            </div>
          ))}
        </div>
        {/* Right-edge fade hints there's more to scroll. The negative
            offset bleeds the gradient past the CardContent padding so
            it lines up with the card's outline, not the inner content
            edge. `pointer-events-none` keeps it from eating clicks. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -right-5 w-16 bg-gradient-to-l from-card to-transparent sm:-right-6"
        />
      </div>
    </div>
  );
}

function Legend() {
  const t = useTranslations("productDetail.calendar");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
        {t("legendSession")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full border border-muted-foreground/60" />
        {t("legendSkipped")}
      </span>
    </div>
  );
}

function MonthGrid({
  monthStart,
  sessionSet,
  skipMap,
  locale,
  todayIso,
}: {
  monthStart: string;
  sessionSet: Set<string>;
  skipMap: Map<string, string>;
  locale: string;
  todayIso?: string;
}) {
  const t = useTranslations("productDetail.calendar");
  const monthDate = new Date(`${monthStart}T12:00:00Z`);
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(monthDate);

  const cells = buildMonthCells(monthStart);
  const skipReasons = monthSkipReasons(monthStart, skipMap);

  return (
    // `h-full` + the wrapper's `flex` make every tile take the row's
    // tallest height so the bottom borders line up across months,
    // even when only some months have a skip-reasons list.
    <div className="flex h-full w-full flex-col rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold capitalize">{monthLabel}</h3>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_KEYS.map((key) => (
          <span key={key}>{t(key)}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center">
        {cells.map((cell, idx) => (
          <DayCell
            key={idx}
            cell={cell}
            isSession={cell ? sessionSet.has(cell.iso) : false}
            skipReason={cell ? skipMap.get(cell.iso) : undefined}
            isToday={cell?.iso === todayIso}
          />
        ))}
      </div>
      {skipReasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
          {skipReasons.map((sr) => (
            <li key={sr.date}>
              {t("skipLine", {
                date: new Intl.DateTimeFormat(locale, {
                  day: "numeric",
                  month: "short",
                }).format(new Date(`${sr.date}T12:00:00Z`)),
                reason: sr.reason,
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DayCell({
  cell,
  isSession,
  skipReason,
  isToday,
}: {
  cell: MonthCell | null;
  isSession: boolean;
  skipReason: string | undefined;
  isToday: boolean;
}) {
  if (!cell) return <span aria-hidden className="h-7" />;

  const isSkipped = skipReason !== undefined;
  return (
    <span
      className={cn(
        "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs tabular-nums",
        isSession && "bg-primary text-primary-foreground font-semibold",
        isSkipped && "border border-muted-foreground/60 text-muted-foreground line-through",
        !isSession && !isSkipped && "text-muted-foreground/70",
        isToday && !isSession && !isSkipped && "ring-1 ring-primary/60",
      )}
      title={skipReason ?? undefined}
    >
      {cell.day}
    </span>
  );
}

interface MonthCell {
  iso: string;
  day: number;
}

const WEEKDAY_KEYS = [
  "weekdayMon",
  "weekdayTue",
  "weekdayWed",
  "weekdayThu",
  "weekdayFri",
  "weekdaySat",
  "weekdaySun",
] as const;

function buildMonthCells(monthStart: string): (MonthCell | null)[] {
  const first = new Date(`${monthStart}T12:00:00Z`);
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const leadingBlanks = schemaWeekdayFromDateString(monthStart);
  const cells: (MonthCell | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ iso, day });
  }

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthSkipReasons(
  monthStart: string,
  skipMap: Map<string, string>,
): { date: string; reason: string }[] {
  const prefix = monthStart.slice(0, 7);
  const out: { date: string; reason: string }[] = [];
  for (const [date, reason] of skipMap.entries()) {
    if (date.startsWith(prefix)) out.push({ date, reason });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
