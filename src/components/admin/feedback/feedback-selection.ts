import { addCalendarDays, parseCalendarDate, toCalendarDate } from "@/lib/calendar-date";
import {
  periodDays,
  stepBuckets,
  type FeedbackBucketUnit,
  type FeedbackPeriod,
  type FeedbackPeriods,
} from "./feedback-tally";

/**
 * **The period an admin is reading, picked on the timeline.** Every feedback
 * page reads the whole history once and the selection is applied in the
 * browser, so it is a pair of session days inside that history, travelling in
 * the URL as `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Every helper here is total: a
 * value it cannot use is clamped or replaced by the default, never refused,
 * because the read behind it is already admin-gated and a 404 for a mistyped
 * URL would cost the reader a page they can plainly see the rest of.
 */

/** The query parameters the selection travels in. */
export const FEEDBACK_FROM_PARAM = "from";
export const FEEDBACK_TO_PARAM = "to";

/** The selection when the URL names none: the last 90 days, ending today. */
export const DEFAULT_SELECTION_DAYS = 90;

/**
 * The first session day the read asks for. Gamers began answering in
 * September 2026; the floor sits well before that so back-dated seed history
 * is read whole. Reading every day since is cheap at this volume — a few
 * thousand responses and sessions a year — and it is what lets the selection
 * move without another read.
 */
export const FEEDBACK_HISTORY_FLOOR = "2026-01-01";

/** Whether a value is a real `YYYY-MM-DD` day, 30 February excluded. */
export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toCalendarDate(parseCalendarDate(value)) === value;
}

/** Days from `origin` to `date`: 0 for the same day. */
export function dayIndex(date: string, origin: string): number {
  return periodDays({ from: origin, to: date }) - 1;
}

/**
 * The span the timeline draws: from the first day anybody answered to today,
 * and never shorter than the default selection, so the default always fits
 * and a history only days old is still drawn across a readable width.
 */
export function feedbackHistory(earliestAnswer: string | null, today: string): FeedbackPeriod {
  const defaultFrom = addCalendarDays(today, 1 - DEFAULT_SELECTION_DAYS);
  return {
    from: earliestAnswer !== null && earliestAnswer < defaultFrom ? earliestAnswer : defaultFrom,
    to: today,
  };
}

/**
 * The shortest selection: one bucket of the timeline, so a selection always
 * covers at least one point it is drawn from. A month is counted at its
 * shortest, so February can be selected on its own.
 */
export function minimumSelectionDays(unit: FeedbackBucketUnit): number {
  return unit === "week" ? 7 : 28;
}

/**
 * A period moved inside the history and grown to the minimum: an end outside
 * the history comes back to its edge, and a period too short grows forward
 * from its start, or back from the history's last day when there is no room.
 */
export function clampSelection(
  period: FeedbackPeriod,
  history: FeedbackPeriod,
  minDays: number,
): FeedbackPeriod {
  const span = periodDays(history);
  const min = Math.max(1, Math.min(minDays, span));
  const clamp = (index: number) => Math.min(Math.max(index, 0), span - 1);
  let start = clamp(dayIndex(period.from, history.from));
  let end = clamp(dayIndex(period.to, history.from));
  if (start > end) [start, end] = [end, start];
  if (end - start + 1 < min) {
    end = Math.min(start + min - 1, span - 1);
    start = end - min + 1;
  }
  return {
    from: addCalendarDays(history.from, start),
    to: addCalendarDays(history.from, end),
  };
}

/** The default selection: the last 90 days of the history. */
export function defaultSelection(history: FeedbackPeriod, minDays: number): FeedbackPeriod {
  return clampSelection(
    { from: addCalendarDays(history.to, 1 - DEFAULT_SELECTION_DAYS), to: history.to },
    history,
    minDays,
  );
}

function firstOf(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * The selection a `?from=&to=` pair names, clamped into the history; the
 * default when either is missing or not a day, or when they run backwards.
 */
export function parseSelection(
  rawFrom: string | string[] | undefined,
  rawTo: string | string[] | undefined,
  history: FeedbackPeriod,
  minDays: number,
): FeedbackPeriod {
  const from = firstOf(rawFrom);
  const to = firstOf(rawTo);
  if (from === undefined || to === undefined || !isCalendarDate(from) || !isCalendarDate(to) || from > to) {
    return defaultSelection(history, minDays);
  }
  return clampSelection({ from, to }, history, minDays);
}

/** The selection slid by `days`, its length kept, stopping at the history's edges. */
export function moveSelection(
  selection: FeedbackPeriod,
  days: number,
  history: FeedbackPeriod,
): FeedbackPeriod {
  const span = periodDays(history);
  const length = periodDays(selection);
  const start = Math.min(Math.max(dayIndex(selection.from, history.from) + days, 0), span - length);
  return {
    from: addCalendarDays(history.from, start),
    to: addCalendarDays(history.from, start + length - 1),
  };
}

/**
 * One end of the selection moved by whole buckets, as a handle's arrow keys
 * move it. The end stops at the history's edge and never comes nearer the
 * other end than the minimum.
 */
export function stepSelectionEdge(
  selection: FeedbackPeriod,
  edge: "from" | "to",
  buckets: number,
  unit: FeedbackBucketUnit,
  history: FeedbackPeriod,
): FeedbackPeriod {
  const min = minimumSelectionDays(unit);
  if (edge === "from") {
    const latest = addCalendarDays(selection.to, 1 - min);
    const moved = stepBuckets(selection.from, unit, buckets);
    const from = moved > latest ? latest : moved < history.from ? history.from : moved;
    return clampSelection({ from, to: selection.to }, history, min);
  }
  const earliest = addCalendarDays(selection.from, min - 1);
  const moved = stepBuckets(selection.to, unit, buckets);
  const to = moved < earliest ? earliest : moved > history.to ? history.to : moved;
  return clampSelection({ from: selection.from, to }, history, min);
}

/**
 * The selection and the equal-length span immediately before it, which every
 * change on the page is measured against: "vs the previous 92 days". Equal in
 * days, so a selection that crosses a 29 February is compared with a span
 * exactly as long.
 */
export function selectionPeriods(current: FeedbackPeriod): FeedbackPeriods {
  const to = addCalendarDays(current.from, -1);
  return { current, previous: { from: addCalendarDays(to, 1 - periodDays(current)), to } };
}

/** The query the selection travels in. */
export function selectionQuery(selection: FeedbackPeriod): Record<string, string> {
  return { [FEEDBACK_FROM_PARAM]: selection.from, [FEEDBACK_TO_PARAM]: selection.to };
}
