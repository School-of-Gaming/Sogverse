import {
  SESSION_FEEDBACK_RATINGS,
  type SessionFeedbackRating,
} from "@/components/voice/feedback/session-feedback-items";
import {
  addCalendarMonths,
  addCalendarDays,
  mondayOf,
  parseCalendarDate,
} from "@/lib/calendar-date";
import type {
  AdminFeedbackResponse,
  FeedbackSource,
} from "@/services/session-feedback/admin-feedback.contracts";
import { FEEDBACK_CATALOGUES } from "./feedback-sources";

/**
 * The counting underneath every figure on the feedback page: answers into
 * tallies, tallies into shares, and session days into the buckets the timeline
 * draws. A share is stated whatever the sample behind it: it exists wherever
 * anything was answered.
 */

/**
 * The lowest answer that counts as positive: "Yes" and "Definitely".
 *
 * A share of positive answers rather than a mean of the 1–5 scale, because the
 * scale's steps are words, not distances — "A bit" is not halfway between "No"
 * and "Definitely" in any sense a child meant.
 */
export const POSITIVE_FROM: SessionFeedbackRating = 4;

/** The highest answer that counts as negative: "No" and "Not really". */
export const NEGATIVE_UP_TO: SessionFeedbackRating = 2;

/** One inclusive span of session days, `YYYY-MM-DD`. */
export interface FeedbackPeriod {
  from: string;
  to: string;
}

/** One answer the source's catalogue knows. */
export interface KnownAnswer {
  key: string;
  rating: SessionFeedbackRating;
}

function isRating(value: number | undefined): value is SessionFeedbackRating {
  return (SESSION_FEEDBACK_RATINGS as readonly (number | undefined)[]).includes(value);
}

/**
 * The answers of one response its source's catalogue still asks, in catalogue
 * order. A retired key, or a value off the 1–5 scale, is skipped.
 */
export function knownAnswers(response: AdminFeedbackResponse): KnownAnswer[] {
  return FEEDBACK_CATALOGUES[response.source].flatMap(({ key }) => {
    const value = response.answers[key];
    return isRating(value) ? [{ key, rating: value }] : [];
  });
}

/** Whether any statement of the response was answered "No" or "Not really". */
export function hasNegativeAnswer(response: AdminFeedbackResponse): boolean {
  return knownAnswers(response).some(({ rating }) => rating <= NEGATIVE_UP_TO);
}

/** Whether the response carries a note. */
export function hasNote(response: AdminFeedbackResponse): boolean {
  return response.note.trim() !== "";
}

/** A running count of answers, finished into a `ShareFigure`. */
export interface Tally {
  /** Responses that answered at least one statement counted here. */
  responses: number;
  answers: number;
  counts: Record<SessionFeedbackRating, number>;
}

export function emptyTally(): Tally {
  return { responses: 0, answers: 0, counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
}

/** Counts one response's ratings into a tally; a response with none is not counted. */
export function addRatings(tally: Tally, ratings: readonly SessionFeedbackRating[]): void {
  if (ratings.length === 0) return;
  tally.responses += 1;
  for (const rating of ratings) {
    tally.answers += 1;
    tally.counts[rating] += 1;
  }
}

/** A set of answers as the page states it. */
export interface ShareFigure {
  /** Responses counted: for one statement, that statement's answers. */
  n: number;
  /** Answers counted (equals `n` for a single statement). */
  answers: number;
  /** Answers at 4–5. */
  positive: number;
  /** Answers at 1–2. */
  negative: number;
  /** `positive / answers`, `null` when nothing was answered. */
  positiveShare: number | null;
  /** `negative / answers`, `null` when nothing was answered. */
  negativeShare: number | null;
  /** How the answers fell across the five levels. */
  distribution: Record<SessionFeedbackRating, number>;
}

export function shareFigure(tally: Tally): ShareFigure {
  const { counts, answers } = tally;
  const positive = counts[4] + counts[5];
  const negative = counts[1] + counts[2];
  return {
    n: tally.responses,
    answers,
    positive,
    negative,
    positiveShare: answers === 0 ? null : positive / answers,
    negativeShare: answers === 0 ? null : negative / answers,
    distribution: { ...counts },
  };
}

/** The overall tally and one tally per catalogue statement, for one set of responses. */
export interface ResponseTallies {
  overall: Tally;
  statements: Map<string, Tally>;
}

export function tallyResponses(
  responses: readonly AdminFeedbackResponse[],
  source: FeedbackSource,
): ResponseTallies {
  const statements = new Map(FEEDBACK_CATALOGUES[source].map(({ key }) => [key, emptyTally()]));
  const overall = emptyTally();
  for (const response of responses) {
    const answers = knownAnswers(response);
    addRatings(overall, answers.map(({ rating }) => rating));
    for (const { key, rating } of answers) {
      const tally = statements.get(key);
      if (tally !== undefined) addRatings(tally, [rating]);
    }
  }
  return { overall, statements };
}

/** `a − b` in percentage points: a gap to the platform. `null` when either side had no answers. */
export function pointsBetween(a: ShareFigure, b: ShareFigure): number | null {
  if (a.positiveShare === null || b.positiveShare === null) return null;
  return (a.positiveShare - b.positiveShare) * 100;
}

/** Whether a scope's positive share is under the platform's for the same thing. */
export function isBelow(scope: ShareFigure, platform: ShareFigure): boolean {
  const gap = pointsBetween(scope, platform);
  return gap !== null && gap < 0;
}

/** What one point of the timeline stands for. */
export type FeedbackBucketUnit = "week" | "month";

/**
 * The longest history, in days, whose timeline is drawn by the week: about six
 * months, 27 points at most. Past that a week is too narrow to aim at on a
 * phone and the line turns to noise, so the whole history goes by the month.
 */
const WEEKLY_UP_TO_DAYS = 183;

/** Inclusive days in a period. */
export function periodDays(period: FeedbackPeriod): number {
  const ms = parseCalendarDate(period.to).getTime() - parseCalendarDate(period.from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** The bucket a history's timeline is drawn in, decided by the history's length. */
export function bucketUnitFor(history: FeedbackPeriod): FeedbackBucketUnit {
  return periodDays(history) <= WEEKLY_UP_TO_DAYS ? "week" : "month";
}

/** `date` moved by `count` whole buckets: weeks of seven days, or calendar months. */
export function stepBuckets(date: string, unit: FeedbackBucketUnit, count: number): string {
  return unit === "week" ? addCalendarDays(date, 7 * count) : addCalendarMonths(date, count);
}

/** The first day of the bucket a session day falls in: its Monday, or its month's 1st. */
export function bucketStartOf(date: string, unit: FeedbackBucketUnit): string {
  return unit === "week" ? mondayOf(date) : `${date.slice(0, 7)}-01`;
}

/** Every bucket the period touches, oldest first — partial ones at either end included. */
export function bucketStarts(period: FeedbackPeriod, unit: FeedbackBucketUnit): string[] {
  const starts: string[] = [];
  const last = bucketStartOf(period.to, unit);
  for (
    let start = bucketStartOf(period.from, unit);
    start <= last;
    start = stepBuckets(start, unit, 1)
  ) {
    starts.push(start);
  }
  return starts;
}
