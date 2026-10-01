import {
  SESSION_FEEDBACK_RATINGS,
  type SessionFeedbackRating,
  type SessionFeedbackTheme,
} from "@/components/voice/feedback/session-feedback-items";
import { addCalendarDays, mondayOf } from "@/lib/calendar-date";
import type {
  AdminFeedbackDataset,
  AdminFeedbackGedu,
  AdminFeedbackGroupRef,
  AdminFeedbackResponse,
  AdminFeedbackSession,
  FeedbackSource,
} from "@/services/session-feedback/admin-feedback.contracts";
import type { FeedbackFilters } from "./feedback-filters";
import { FEEDBACK_CATALOGUES, themesOf } from "./feedback-sources";

/**
 * **The feedback page's arithmetic** — one pure pass from the dataset the route
 * read to every figure the page draws, for one source and one slice.
 *
 * Nothing here knows about React, the URL or the locale, so the page, the
 * preview scene and the tests all compute the same numbers from the same
 * document.
 */

/**
 * The lowest answer that counts as positive: "Yes" and "Definitely".
 *
 * The headline is a share of positive answers rather than a mean of the 1–5
 * scale because the scale's steps are words, not distances — "A bit" is not
 * halfway between "No" and "Definitely" in any sense a child meant — and a
 * share reads at a glance and stays honest on a handful of answers.
 */
export const POSITIVE_FROM: SessionFeedbackRating = 4;

/**
 * Below this many, a figure is shown but not trusted: a week of three answers
 * swinging from 33% to 100% is noise, and the page draws it as such.
 */
export const LOW_N = 5;

/** How a set of answers fell across the five levels. */
export interface RatingTally {
  /** Answers counted. */
  n: number;
  /** Answers at `POSITIVE_FROM` or above. */
  positive: number;
  counts: Record<SessionFeedbackRating, number>;
}

/** The positive share of a tally, or `null` when nothing was answered. */
export function positiveShare(tally: RatingTally): number | null {
  return tally.n === 0 ? null : tally.positive / tally.n;
}

/** Every figure a slice carries, each with the count behind it. */
export interface FeedbackFigures {
  responses: number;
  /**
   * How many could have answered, or `null` where no denominator exists for
   * this slice (a gamer's sessions are not counted individually).
   */
  eligible: number | null;
  /** Responses over eligible, or `null` when there is no denominator or it is 0. */
  responseRate: number | null;
  overall: RatingTally;
  themes: Record<SessionFeedbackTheme, RatingTally>;
  /** Responses carrying a note. */
  notes: number;
}

export interface StatementFigures {
  key: string;
  theme: SessionFeedbackTheme;
  tally: RatingTally;
}

export interface WeekFigures {
  /** The Monday the week starts on. */
  weekStart: string;
  responses: number;
  overall: RatingTally;
  themes: Record<SessionFeedbackTheme, RatingTally>;
}

export type BreakdownDimension = "product" | "group" | "gedu" | "gamer";

export interface BreakdownRow extends FeedbackFigures {
  id: string;
  name: string;
  /** The product a product or group row belongs to; `null` for people. */
  ref: AdminFeedbackGroupRef | null;
}

export interface FeedbackView {
  source: FeedbackSource;
  themes: SessionFeedbackTheme[];
  totals: FeedbackFigures;
  statements: StatementFigures[];
  /** Every week the range touches, oldest first, empty weeks included. */
  weeks: WeekFigures[];
  breakdowns: Record<BreakdownDimension, BreakdownRow[]>;
  /** The slice's responses, newest session first. */
  responses: AdminFeedbackResponse[];
}

function emptyTally(): RatingTally {
  return { n: 0, positive: 0, counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
}

function emptyThemes(): Record<SessionFeedbackTheme, RatingTally> {
  return {
    Learning: emptyTally(),
    Fun: emptyTally(),
    "Gedu quality": emptyTally(),
    Belonging: emptyTally(),
  };
}

function isRating(value: number): value is SessionFeedbackRating {
  return (SESSION_FEEDBACK_RATINGS as readonly number[]).includes(value);
}

function count(tally: RatingTally, rating: SessionFeedbackRating): void {
  tally.n += 1;
  tally.counts[rating] += 1;
  if (rating >= POSITIVE_FROM) tally.positive += 1;
}

/**
 * The answers of one response the source's catalogue knows, as
 * statement → rating. A retired key, or a value outside the scale, is skipped.
 */
function knownAnswers(
  response: AdminFeedbackResponse,
): { key: string; theme: SessionFeedbackTheme; rating: SessionFeedbackRating }[] {
  return FEEDBACK_CATALOGUES[response.source].flatMap(({ key, theme }) => {
    const value = response.answers[key];
    // `value` is undefined for a statement this response skipped; the guard
    // refuses that along with anything off the scale.
    return isRating(value) ? [{ key, theme, rating: value }] : [];
  });
}

function hasGedu(gedus: AdminFeedbackGedu[], id: string): boolean {
  return gedus.some((gedu) => gedu.id === id);
}

function matchesSession(
  row: AdminFeedbackGroupRef & { gedus: AdminFeedbackGedu[] },
  filters: FeedbackFilters,
): boolean {
  return (
    (filters.product === null || row.productId === filters.product) &&
    (filters.group === null || row.groupId === filters.group) &&
    (filters.gedu === null || hasGedu(row.gedus, filters.gedu))
  );
}

function matchesResponse(
  response: AdminFeedbackResponse,
  filters: FeedbackFilters,
): boolean {
  return (
    matchesSession(response, filters) &&
    (filters.gamer === null || response.respondent.id === filters.gamer)
  );
}

/** A running total, finished into `FeedbackFigures` once every row is in. */
interface Accumulator {
  responses: number;
  eligible: number;
  overall: RatingTally;
  themes: Record<SessionFeedbackTheme, RatingTally>;
  notes: number;
}

function emptyAccumulator(): Accumulator {
  return { responses: 0, eligible: 0, overall: emptyTally(), themes: emptyThemes(), notes: 0 };
}

function addResponse(acc: Accumulator, response: AdminFeedbackResponse): void {
  acc.responses += 1;
  if (response.note.trim() !== "") acc.notes += 1;
  for (const { theme, rating } of knownAnswers(response)) {
    count(acc.overall, rating);
    count(acc.themes[theme], rating);
  }
}

function finish(acc: Accumulator, hasDenominator: boolean): FeedbackFigures {
  const eligible = hasDenominator ? acc.eligible : null;
  return {
    responses: acc.responses,
    eligible,
    responseRate: eligible === null || eligible === 0 ? null : acc.responses / eligible,
    overall: acc.overall,
    themes: acc.themes,
    notes: acc.notes,
  };
}

/**
 * Rows of one breakdown, grown by key. A row can be opened by a session alone —
 * a product that ran thirty sessions and heard nothing back is a finding, and
 * belongs in the table at a 0% response rate rather than missing from it.
 */
class Breakdown {
  private rows = new Map<string, { name: string; ref: AdminFeedbackGroupRef | null; acc: Accumulator }>();

  constructor(private readonly hasDenominator: boolean) {}

  private row(id: string, name: string, ref: AdminFeedbackGroupRef | null) {
    let row = this.rows.get(id);
    if (row === undefined) {
      row = { name, ref, acc: emptyAccumulator() };
      this.rows.set(id, row);
    }
    return row;
  }

  addSession(id: string, name: string, ref: AdminFeedbackGroupRef | null, eligible: number) {
    this.row(id, name, ref).acc.eligible += eligible;
  }

  addResponse(id: string, name: string, ref: AdminFeedbackGroupRef | null, response: AdminFeedbackResponse) {
    addResponse(this.row(id, name, ref).acc, response);
  }

  finish(): BreakdownRow[] {
    return [...this.rows.entries()]
      .map(([id, { name, ref, acc }]) => ({
        id,
        name,
        ref,
        ...finish(acc, this.hasDenominator),
      }))
      .sort((a, b) => b.responses - a.responses || a.name.localeCompare(b.name));
  }
}

function groupRef(row: AdminFeedbackGroupRef): AdminFeedbackGroupRef {
  return {
    groupId: row.groupId,
    groupName: row.groupName,
    productId: row.productId,
    productName: row.productName,
    productType: row.productType,
    isRemote: row.isRemote,
  };
}

/** Every Monday from the week `from` falls in to the week `to` falls in. */
export function weeksBetween(from: string, to: string): string[] {
  const weeks: string[] = [];
  const last = mondayOf(to);
  for (let week = mondayOf(from); week <= last; week = addCalendarDays(week, 7)) {
    weeks.push(week);
  }
  return weeks;
}

/**
 * Everything the page draws for one source, narrowed to one slice.
 *
 * The response rate's denominator is the sessions in the same slice, so a
 * product filter divides that product's responses by that product's present
 * gamers. A gamer filter has no denominator — the dataset counts who could
 * answer per session, not which gamers they were — so the rate is withheld
 * rather than divided by the wrong thing, and the gamer breakdown carries none.
 */
export function buildFeedbackView(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
  filters: FeedbackFilters,
): FeedbackView {
  const hasDenominator = filters.gamer === null;
  const responses = ofSource(dataset.responses, source)
    .filter((response) => matchesResponse(response, filters))
    .sort(
      (a, b) =>
        b.sessionDate.localeCompare(a.sessionDate) ||
        b.submittedAt.localeCompare(a.submittedAt),
    );
  const sessions: AdminFeedbackSession[] = hasDenominator
    ? ofSource(dataset.sessions, source).filter((session) => matchesSession(session, filters))
    : [];

  const totals = emptyAccumulator();
  const statementTallies = new Map(
    FEEDBACK_CATALOGUES[source].map(({ key }) => [key, emptyTally()]),
  );
  const weeks = new Map(
    weeksBetween(dataset.from, dataset.to).map((weekStart) => [
      weekStart,
      { weekStart, responses: 0, overall: emptyTally(), themes: emptyThemes() },
    ]),
  );
  const breakdowns = {
    product: new Breakdown(hasDenominator),
    group: new Breakdown(hasDenominator),
    gedu: new Breakdown(hasDenominator),
    gamer: new Breakdown(false),
  };

  for (const session of sessions) {
    totals.eligible += session.eligibleCount;
    const ref = groupRef(session);
    breakdowns.product.addSession(session.productId, session.productName, ref, session.eligibleCount);
    breakdowns.group.addSession(session.groupId, session.groupName, ref, session.eligibleCount);
    for (const gedu of uniqueGedus(session.gedus)) {
      breakdowns.gedu.addSession(gedu.id, gedu.name, null, session.eligibleCount);
    }
  }

  for (const response of responses) {
    addResponse(totals, response);
    for (const { key, rating } of knownAnswers(response)) {
      const tally = statementTallies.get(key);
      if (tally !== undefined) count(tally, rating);
    }

    const week = weeks.get(mondayOf(response.sessionDate));
    if (week !== undefined) {
      week.responses += 1;
      for (const { theme, rating } of knownAnswers(response)) {
        count(week.overall, rating);
        count(week.themes[theme], rating);
      }
    }

    const ref = groupRef(response);
    breakdowns.product.addResponse(response.productId, response.productName, ref, response);
    breakdowns.group.addResponse(response.groupId, response.groupName, ref, response);
    // A response about a session two Gedus ran counts toward each of them.
    for (const gedu of uniqueGedus(response.gedus)) {
      breakdowns.gedu.addResponse(gedu.id, gedu.name, null, response);
    }
    breakdowns.gamer.addResponse(response.respondent.id, response.respondent.name, null, response);
  }

  return {
    source,
    themes: themesOf(source),
    totals: finish(totals, hasDenominator),
    statements: FEEDBACK_CATALOGUES[source].map(({ key, theme }) => ({
      key,
      theme,
      tally: statementTallies.get(key) ?? emptyTally(),
    })),
    weeks: [...weeks.values()],
    breakdowns: {
      product: breakdowns.product.finish(),
      group: breakdowns.group.finish(),
      gedu: breakdowns.gedu.finish(),
      gamer: breakdowns.gamer.finish(),
    },
    responses,
  };
}

/**
 * The rows one source contributed. Partitioned rather than compared row by row:
 * a dataset holds every source's rows side by side, and each figure on the page
 * reads exactly one source's share of them.
 */
export function ofSource<T extends { source: FeedbackSource }>(
  rows: readonly T[],
  source: FeedbackSource,
): T[] {
  const bySource = new Map<FeedbackSource, T[]>();
  for (const row of rows) {
    const bucket = bySource.get(row.source);
    if (bucket === undefined) bySource.set(row.source, [row]);
    else bucket.push(row);
  }
  return bySource.get(source) ?? [];
}

/** A Gedu listed twice on one session (say, primary and substitute) counts once. */
function uniqueGedus(gedus: AdminFeedbackGedu[]): AdminFeedbackGedu[] {
  const seen = new Set<string>();
  return gedus.filter((gedu) => {
    if (seen.has(gedu.id)) return false;
    seen.add(gedu.id);
    return true;
  });
}

/**
 * The display name of each active filter, looked up across the whole dataset
 * rather than the slice — a filter can outlive the range it was set in, and its
 * chip should still say who it is. `null` where the id appears nowhere.
 */
export function feedbackFilterNames(
  dataset: AdminFeedbackDataset,
  filters: FeedbackFilters,
): Record<keyof FeedbackFilters, string | null> {
  const rows = [...dataset.responses, ...dataset.sessions];
  const find = <T>(pick: (row: AdminFeedbackResponse | AdminFeedbackSession) => T | undefined) => {
    for (const row of rows) {
      const found = pick(row);
      if (found !== undefined) return found;
    }
    return null;
  };

  return {
    product:
      filters.product === null
        ? null
        : find((row) => (row.productId === filters.product ? row.productName : undefined)),
    group:
      filters.group === null
        ? null
        : find((row) => (row.groupId === filters.group ? row.groupName : undefined)),
    gedu:
      filters.gedu === null
        ? null
        : find((row) => row.gedus.find((gedu) => gedu.id === filters.gedu)?.name),
    gamer:
      filters.gamer === null
        ? null
        : find((row) =>
            "respondent" in row && row.respondent.id === filters.gamer
              ? row.respondent.name
              : undefined,
          ),
  };
}
