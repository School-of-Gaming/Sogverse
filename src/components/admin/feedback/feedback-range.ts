import { addCalendarDays, addCalendarMonths } from "@/lib/calendar-date";
import { periodDays, type FeedbackPeriod, type FeedbackPeriods } from "./feedback-tally";

/**
 * The spans the feedback page can be read over. Three, because the page has
 * three questions to answer: what happened lately, how the term is going, and
 * how the year has trended.
 */
export const FEEDBACK_RANGES = ["30d", "90d", "12m"] as const;

export type FeedbackRange = (typeof FEEDBACK_RANGES)[number];

export const DEFAULT_FEEDBACK_RANGE: FeedbackRange = "90d";

/** The query parameter the range travels in. */
export const FEEDBACK_RANGE_PARAM = "range";

/**
 * The range a `?range=` value names, or the default for anything else.
 *
 * An unusable value falls to the default rather than refusing: it selects a
 * read that is already admin-gated, and a 404 for a mistyped URL would cost the
 * reader a page they can plainly see the rest of.
 */
export function resolveFeedbackRange(
  raw: string | string[] | undefined,
): FeedbackRange {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return FEEDBACK_RANGES.find((range) => range === value) ?? DEFAULT_FEEDBACK_RANGE;
}

/**
 * The inclusive session days a range covers, ending on `today`.
 *
 * Both ends are bare calendar dates, as a session's day is, so the arithmetic is
 * the UTC-pinned calendar kind. Thirty days is today and the twenty-nine before
 * it; twelve months starts the day after the same date a year ago, so the span
 * never counts one calendar day twice.
 */
export function feedbackRangeBounds(
  range: FeedbackRange,
  today: string,
): { from: string; to: string } {
  switch (range) {
    case "30d":
      return { from: addCalendarDays(today, -29), to: today };
    case "90d":
      return { from: addCalendarDays(today, -89), to: today };
    case "12m":
      return { from: addCalendarDays(addCalendarMonths(today, -12), 1), to: today };
  }
}

/**
 * The range being read and the equal-length span immediately before it, which
 * every change on the page is measured against.
 *
 * Equal length in days, so a 12-month range that crosses a 29 February is
 * compared with a span exactly as long rather than with "the year before".
 */
export function feedbackRangePeriods(range: FeedbackRange, today: string): FeedbackPeriods {
  const current = feedbackRangeBounds(range, today);
  const to = addCalendarDays(current.from, -1);
  const from = addCalendarDays(to, 1 - periodDays(current));
  return { current, previous: { from, to } };
}

/** The one span of session days the page reads: both periods, end to end. */
export function feedbackReadSpan(periods: FeedbackPeriods): FeedbackPeriod {
  return { from: periods.previous.from, to: periods.current.to };
}
