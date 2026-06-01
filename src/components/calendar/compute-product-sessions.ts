import type { ProductBrowseRow, ProductType } from "@/types";

// Pure date-walking that produces the session-date and skipped-date arrays
// the calendar View renders. Lives in its own file so it's unit-testable
// without React.
//
// Date model: products.start_date / end_date are Postgres DATE columns,
// anchored conceptually in the product's timezone. We treat them as
// pure date strings (YYYY-MM-DD) and walk by calendar days — no timezone
// math needed for "which day is it on the calendar." The display layer
// formats month and weekday names per the user's UI locale.
//
// Schema weekday convention: 0=Mon..6=Sun (per redesign §5.1). JavaScript's
// Date.getUTCDay() returns 0=Sun..6=Sat, so we convert with (jsDay + 6) % 7.

export interface SessionDate {
  date: string; // YYYY-MM-DD
}

export interface SkippedSessionDate {
  date: string; // YYYY-MM-DD
  reason: string;
}

export interface ProductCalendarInput {
  productType: ProductType;
  startDate: string | null;
  endDate: string | null;
  scheduleSlots: ProductBrowseRow["schedule_slots"];
  /**
   * Holiday rows linked to the product. Each entry's `date` is a
   * YYYY-MM-DD string from `calendar_holidays.date`. `reason`
   * falls back to the parent calendar's `name` if the admin didn't
   * set a per-date one (resolved upstream by the service layer).
   */
  holidays: { date: string; reason: string }[];
}

export interface ProductCalendarResult {
  /** Inclusive first calendar month rendered (YYYY-MM-01). */
  rangeStart: string;
  /** Inclusive last calendar month rendered (YYYY-MM-01). */
  rangeEnd: string;
  sessions: SessionDate[];
  skips: SkippedSessionDate[];
}

/**
 * Compute the set of (sessions, skips) for a product across its term.
 *
 * Returns `null` when there isn't enough information to render a calendar
 * (no start/end date, or fewer than 2 sessions). The calendar View only
 * renders when this is non-null.
 *
 * Today this only marks holiday-driven skips. When `session_overrides`
 * (admin-cancel-session) ships, extend the input with those overrides and
 * union them into `skips` — no View change required.
 */
export function computeProductSessions(
  input: ProductCalendarInput,
): ProductCalendarResult | null {
  if (!input.startDate || !input.endDate) return null;
  if (input.startDate > input.endDate) return null;

  // Events are single-date — calendar adds no value over the headline date.
  if (input.productType === "event") return null;

  const slotWeekdays = new Set(input.scheduleSlots.map((s) => s.weekday));
  if (slotWeekdays.size === 0) return null;

  const holidayMap = new Map<string, string>();
  for (const h of input.holidays) holidayMap.set(h.date, h.reason);

  const sessions: SessionDate[] = [];
  const skips: SkippedSessionDate[] = [];

  for (const dateStr of iterateDays(input.startDate, input.endDate)) {
    const schemaWeekday = schemaWeekdayFromDateString(dateStr);
    if (!slotWeekdays.has(schemaWeekday)) continue;

    const holidayName = holidayMap.get(dateStr);
    if (holidayName) {
      skips.push({ date: dateStr, reason: holidayName });
    } else {
      sessions.push({ date: dateStr });
    }
  }

  if (sessions.length + skips.length < 2) return null;

  return {
    rangeStart: monthStartOf(input.startDate),
    rangeEnd: monthStartOf(input.endDate),
    sessions,
    skips,
  };
}

export function* iterateDays(start: string, end: string): Generator<string> {
  // Anchor at UTC noon so DST and locale-rendering quirks don't tip the
  // date back into the previous calendar day.
  const cur = new Date(`${start}T12:00:00Z`);
  const stop = new Date(`${end}T12:00:00Z`);
  while (cur.getTime() <= stop.getTime()) {
    yield toIsoDate(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

export function schemaWeekdayFromDateString(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

export function monthStartOf(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function* iterateMonthStarts(
  startMonth: string,
  endMonth: string,
): Generator<string> {
  const cur = new Date(`${startMonth}T12:00:00Z`);
  const stop = new Date(`${endMonth}T12:00:00Z`);
  while (cur.getTime() <= stop.getTime()) {
    yield toIsoDate(cur);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
}
