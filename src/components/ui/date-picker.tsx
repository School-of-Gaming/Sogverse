"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  addCalendarDays,
  addCalendarMonths,
  mondayOf,
  monthsAfter,
} from "@/lib/calendar-date";
import { isoWeekOf, isoWeekStart, resolveNearestIsoWeek } from "@/lib/iso-week";
import { firstSessionDate, lastSessionDate } from "@/lib/session-dates";
import { cn, formatDateOnly } from "@/lib/utils";

/**
 * **What a click on a week number means for this field.**
 *
 * A week is seven days, so picking one is only an answer once the field says
 * which of the seven it wants. A start field wants the term's first session and
 * an end field its last, which is why the edge travels with the weekdays the
 * product meets on rather than being inferred from anything the picker can see.
 * An empty `weekdays` falls through to plain Monday/Sunday by
 * `firstSessionDate`/`lastSessionDate`'s own contract — a product with no
 * schedule has no pattern to snap to.
 */
export interface WeekPick {
  edge: "start" | "end";
  /** 0 = Monday … 6 = Sunday, the convention `schedule_slots.weekday` uses. */
  weekdays: readonly number[];
}

export interface DatePickerProps {
  id: string;
  /** A bare `YYYY-MM-DD`, or `""` for an unset field. */
  value: string;
  onChange: (value: string) => void;
  /**
   * Today as a bare date **in whichever zone the field is about** — a product's
   * own zone for a product's dates. The caller computes it, because only the
   * caller knows which zone that is; a picker reaching for `new Date()` would
   * ring the runtime's today, which is a different day for half the planet.
   */
  today: string;
  weekPick: WeekPick;
  required?: boolean;
  disabled?: boolean;
  /** The other end(s) of the term, so the days between read as one band. */
  rangeStart?: string | null;
  rangeEnd?: string | null;
  /** Width only. The control owns its own height, border and radii. */
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

/**
 * A date field that can also be answered in ISO week numbers.
 *
 * Finnish admins plan clubs in weeks — "kerho alkaa viikolla 34" — so the week
 * is a first-class way to answer this field rather than a decoration on it. The
 * native `<input type="date">` stays exactly where it was: typing, keyboard
 * entry and `required` validation are the browser's, and nothing here
 * reimplements them. What is added is the button joined onto its right edge,
 * which reads back the week the current value falls in and opens a calendar
 * whose gutter is a column of week numbers.
 *
 * Chrome's own calendar glyph is hidden, so the field carries exactly one
 * calendar affordance and it is the one that knows about weeks.
 */
export function DatePicker({
  id,
  value,
  onChange,
  today,
  weekPick,
  required = false,
  disabled = false,
  rangeStart = null,
  rangeEnd = null,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: DatePickerProps) {
  const t = useTranslations("datePicker");
  const c = useTranslations("common");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        // An outside click is not a return to the trigger — the pointer is
        // already somewhere else, and pulling focus back would fight it.
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const week = value === "" ? null : isoWeekOf(value).week;

  // Tab out of the popover and the calendar goes with it: a dialog left open
  // behind a form the admin is already typing into is a panel over content they
  // cannot see. Focus is *not* pulled back — it has gone exactly where they
  // sent it — which is what separates this from Escape. A blur with no
  // `relatedTarget` (a press on the popover's own padding, the window losing
  // focus) is left alone: the outside-pointer listener owns that case, and
  // closing here would eat the click about to land.
  function onContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!open) return;
    const next = e.relatedTarget;
    if (!(next instanceof Node) || e.currentTarget.contains(next)) return;
    setOpen(false);
  }

  return (
    <div
      ref={containerRef}
      onBlur={onContainerBlur}
      className={cn("relative", className)}
    >
      <div className="flex">
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          className="min-w-0 flex-1 rounded-r-none border-r-0 [&::-webkit-calendar-picker-indicator]:hidden"
        />
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-label={t("openCalendar")}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          onClick={() => (open ? close() : setOpen(true))}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-md rounded-l-none border border-border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
          {week !== null && (
            <span className="tabular-nums">{c("week", { week })}</span>
          )}
        </button>
      </div>

      {open && (
        <WeekCalendar
          id={dialogId}
          label={t("openCalendar")}
          value={value}
          today={today}
          weekPick={weekPick}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onPick={(picked) => {
            onChange(picked);
            close();
          }}
        />
      )}
    </div>
  );
}

/** The first day of the month a bare date falls in. */
function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/**
 * The seven day-of-week headings, in the reader's locale.
 *
 * 2024-01-01 is a Monday, which makes that week the cheapest known Monday-first
 * run to format. The names come out of `Intl` rather than a label array, for the
 * same reason `calendar-date.ts` names no day: an array would be seven English
 * words with no locale to translate them.
 */
const HEADING_WEEK = [1, 2, 3, 4, 5, 6, 7].map(
  (day) => `2024-01-0${day}`,
);

interface WeekCalendarProps {
  id: string;
  label: string;
  value: string;
  today: string;
  weekPick: WeekPick;
  rangeStart: string | null;
  rangeEnd: string | null;
  onPick: (date: string) => void;
}

/**
 * The month grid, with a week-number gutter that is itself pickable.
 *
 * Eight columns: the gutter, then Monday to Sunday. Every row is a whole ISO
 * week, so the gutter is never a decoration computed per row — it is the row's
 * own identity, and clicking it answers the field with the day the week's edge
 * resolves to. Hovering it previews that day, so "start picks the first session
 * of the week, end picks the last" is seen rather than explained.
 *
 * All arithmetic is bare-date and UTC-pinned through `@/lib/calendar-date`;
 * nothing here constructs a `Date` for a calendar day or reads a local field off
 * one.
 */
function WeekCalendar({
  id,
  label,
  value,
  today,
  weekPick,
  rangeStart,
  rangeEnd,
  onPick,
}: WeekCalendarProps) {
  const t = useTranslations("datePicker");
  const c = useTranslations("common");
  const locale = useLocale();

  const [month, setMonth] = useState(() =>
    firstOfMonth(value === "" ? today : value),
  );
  const [focusDate, setFocusDate] = useState(() =>
    value === "" ? today : value,
  );
  const [weekInput, setWeekInput] = useState("");
  const [previewWeekStart, setPreviewWeekStart] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Focus follows the roving index only when the *keyboard* moved it. A month
  // step moves the index too — the old cell is about to unmount and something
  // has to own the tab stop — and pulling focus off the nav button the admin is
  // clicking through would make paging by pointer impossible.
  const wantsFocus = useRef(false);

  const gridStart = mondayOf(month);
  const gridEnd = addCalendarDays(
    mondayOf(addCalendarDays(monthsAfter(month, 1), -1)),
    6,
  );

  const weeks: string[] = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addCalendarDays(cursor, 7)) {
    weeks.push(cursor);
  }

  useEffect(() => {
    gridRef.current
      ?.querySelector<HTMLButtonElement>('[data-day-cell="true"][tabindex="0"]')
      ?.focus();
    // The opening focus, once: the dialog takes focus when it appears, and the
    // roving effect below owns every move after that.
  }, []);

  useEffect(() => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)
      ?.focus();
  }, [focusDate]);

  /** Moves the roving tab stop, paging the grid when the day is off it. */
  const moveFocus = useCallback(
    (next: string) => {
      wantsFocus.current = true;
      setFocusDate(next);
      setMonth((current) => {
        const start = mondayOf(current);
        const end = addCalendarDays(
          mondayOf(addCalendarDays(monthsAfter(current, 1), -1)),
          6,
        );
        return next < start || next > end ? firstOfMonth(next) : current;
      });
    },
    [],
  );

  /** Pages the grid without touching focus, keeping the tab stop on the page. */
  const goToMonth = useCallback((next: string) => {
    setMonth(next);
    setFocusDate((current) => {
      const start = mondayOf(next);
      const end = addCalendarDays(
        mondayOf(addCalendarDays(monthsAfter(next, 1), -1)),
        6,
      );
      return current < start || current > end ? next : current;
    });
  }, []);

  /**
   * The day a click on this week's number answers the field with.
   *
   * Deliberately not memoised: every caller builds `weekPick` inline, so its
   * `weekdays` array is a new reference on each render and a `useCallback` keyed
   * on it would return a new function every time anyway — a memo that only
   * costs. Nothing downstream needs the identity to be stable.
   */
  function weekTarget(monday: string): string {
    return weekPick.edge === "start"
      ? firstSessionDate(monday, weekPick.weekdays)
      : lastSessionDate(addCalendarDays(monday, 6), weekPick.weekdays);
  }

  // The band: the value at one end, whichever of the two range props the caller
  // supplied at the other. Both ends are drawn on the lifted ground and the
  // value takes the act fill on top of it, so the term reads as one run rather
  // than two unrelated dates.
  const otherEnd = rangeStart ?? rangeEnd ?? null;
  const bandLow =
    value !== "" && otherEnd ? (value < otherEnd ? value : otherEnd) : null;
  const bandHigh =
    value !== "" && otherEnd ? (value < otherEnd ? otherEnd : value) : null;

  function submitWeek(text: string) {
    // Resolved against the month on screen rather than its ISO year alone:
    // typing `1` in December means the January two weeks ahead, not the one
    // eleven months back.
    const parsed = resolveNearestIsoWeek(text, month);
    if (parsed === null) return;
    onPick(weekTarget(isoWeekStart(parsed)));
  }

  function onDayKeyDown(e: React.KeyboardEvent, date: string) {
    const step = (days: number) => {
      e.preventDefault();
      moveFocus(addCalendarDays(date, days));
    };
    switch (e.key) {
      case "ArrowLeft":
        return step(-1);
      case "ArrowRight":
        return step(1);
      case "ArrowUp":
        return step(-7);
      case "ArrowDown":
        return step(7);
      case "Home":
        e.preventDefault();
        return moveFocus(mondayOf(date));
      case "End":
        e.preventDefault();
        return moveFocus(addCalendarDays(mondayOf(date), 6));
      case "PageUp":
        e.preventDefault();
        return moveFocus(addCalendarMonths(date, -1));
      case "PageDown":
        e.preventDefault();
        return moveFocus(addCalendarMonths(date, 1));
      default:
        return undefined;
    }
  }

  return (
    <div
      id={id}
      role="dialog"
      aria-label={label}
      className="absolute left-0 top-full z-30 mt-1 w-[320px] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-card p-3 text-foreground shadow-md"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("previousMonth")}
          onClick={() => goToMonth(addCalendarMonths(month, -1))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-medium">
          {formatDateOnly(month, locale, { month: "long", year: "numeric" })}
        </div>
        <button
          type="button"
          aria-label={t("nextMonth")}
          onClick={() => goToMonth(addCalendarMonths(month, 1))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex h-8 items-center gap-1 rounded-md border border-border px-2">
          <span aria-hidden className="text-xs text-muted-foreground">
            {c("weekColumn")}
          </span>
          <input
            type="text"
            inputMode="numeric"
            aria-label={t("weekNumber")}
            title={t("goToWeek")}
            value={weekInput}
            onChange={(e) => setWeekInput(e.target.value)}
            onKeyDown={(e) => {
              // Always swallowed: this control sits inside the product form, and
              // an un-prevented Enter in a text input submits it. An
              // unrecognised week does nothing at all and keeps the caret.
              if (e.key !== "Enter") return;
              e.preventDefault();
              submitWeek(weekInput);
            }}
            className="h-6 w-10 min-w-0 bg-transparent text-sm tabular-nums text-foreground focus-visible:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => goToMonth(firstOfMonth(today))}
          className="ml-auto rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
        >
          {t("today")}
        </button>
      </div>

      {/* A real grid, not eight columns of loose buttons: the gutter is a row
          header, so a screen reader reading a day announces the week it is in,
          and the roving tab stop below is the one arrow-key focus the grid
          pattern expects. */}
      <div
        ref={gridRef}
        role="grid"
        aria-label={formatDateOnly(month, locale, {
          month: "long",
          year: "numeric",
        })}
        className="mt-2 tabular-nums"
      >
        <div role="row" className="grid grid-cols-8">
          <div
            role="columnheader"
            className="flex h-8 items-center justify-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {c("weekColumn")}
          </div>
          {HEADING_WEEK.map((day) => (
            <div
              key={day}
              role="columnheader"
              className="flex h-8 items-center justify-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {formatDateOnly(day, locale, { weekday: "short" })}
            </div>
          ))}
        </div>

        {weeks.map((monday) => {
          const { week } = isoWeekOf(monday);
          const previewing = previewWeekStart === monday;
          const target = weekTarget(monday);
          return (
            <div
              key={monday}
              role="row"
              className={cn(
                "grid grid-cols-8 rounded-sm",
                previewing && "bg-hover",
              )}
            >
              <div role="rowheader" className="flex">
                <button
                  type="button"
                  // Off the tab ring on purpose: seven gutter buttons in one
                  // popover would be seven tab stops between the calendar and the
                  // form's next field, and the roving day index already gives the
                  // keyboard its one way in. The pointer and a screen reader
                  // walking the grid still reach it.
                  tabIndex={-1}
                  aria-label={t("selectWeek", { week })}
                  onClick={() => onPick(target)}
                  onMouseEnter={() => setPreviewWeekStart(monday)}
                  onMouseLeave={() =>
                    setPreviewWeekStart((current) =>
                      current === monday ? null : current,
                    )
                  }
                  onFocus={() => setPreviewWeekStart(monday)}
                  onBlur={() =>
                    setPreviewWeekStart((current) =>
                      current === monday ? null : current,
                    )
                  }
                  className="flex h-9 w-full items-center justify-center rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
                >
                  {week}
                </button>
              </div>
              {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
                const date = addCalendarDays(monday, offset);
                const selected = date === value;
                const inBand =
                  bandLow !== null &&
                  bandHigh !== null &&
                  date >= bandLow &&
                  date <= bandHigh;
                return (
                  <button
                    key={date}
                    type="button"
                    // The cell *is* the grid cell rather than sitting inside
                    // one: a day is the thing being selected, and `aria-selected`
                    // is what a grid says about it. The visible content is a
                    // bare numeral, so the whole date is spelled out here — "19"
                    // read aloud out of a grid names no month and no year.
                    role="gridcell"
                    data-date={date}
                    data-day-cell="true"
                    tabIndex={date === focusDate ? 0 : -1}
                    aria-label={formatDateOnly(date, locale, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    aria-current={date === today ? "date" : undefined}
                    aria-selected={selected}
                    onClick={() => onPick(date)}
                    onKeyDown={(e) => onDayKeyDown(e, date)}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-sm text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act",
                      date.slice(0, 7) === month.slice(0, 7)
                        ? "text-foreground"
                        : "text-muted-foreground",
                      inBand && "bg-lifted",
                      !selected && "hover:bg-hover",
                      date === today && "ring-1 ring-act",
                      previewing && date === target && "ring-2 ring-act",
                      selected && "bg-act font-medium text-act-foreground",
                    )}
                  >
                    {Number(date.slice(8, 10))}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
