import type { SessionFeedbackTheme } from "@/components/voice/feedback/session-feedback-items";
import type {
  AdminFeedbackDataset,
  AdminFeedbackGedu,
  AdminFeedbackGroupRef,
  AdminFeedbackResponse,
  AdminFeedbackSession,
  FeedbackSource,
} from "@/services/session-feedback/admin-feedback.contracts";
import type { ProductType } from "@/types";
import {
  addRatings,
  bucketStartOf,
  bucketStarts,
  bucketUnitFor,
  emptyTally,
  hasLowAnswer,
  hasNote,
  inPeriod,
  isBelow,
  knownAnswers,
  pointsBetween,
  shareFigure,
  tallyResponses,
  type FeedbackBucketUnit,
  type FeedbackPeriod,
  type FeedbackPeriods,
  type ResponseTallies,
  type ShareFigure,
  type Tally,
} from "./feedback-tally";
import { FEEDBACK_CATALOGUES } from "./feedback-sources";

export {
  bucketUnitFor,
  type FeedbackBucketUnit,
  type FeedbackPeriod,
  type FeedbackPeriods,
  type ShareFigure,
} from "./feedback-tally";

/**
 * **The feedback page's arithmetic** — pure passes from the dataset the route
 * read to the view model of each of the page's four views: the overview, a
 * dimension's list, one scope's detail, and what gamers said.
 *
 * Every builder takes the dataset, the source being read and both periods; the
 * dataset spans both, and each builder splits it by session day itself. Every
 * figure is per source, compared against the previous period, and — below the
 * overview — against the platform for the same period, except a gamer's,
 * which carries no platform figure at all. Nothing here knows
 * about React, the URL or the locale: ids and message-key-shaped values out,
 * labels are the UI's.
 */

/** The dimensions the overview summarises and a list can be opened for. */
export type FeedbackDimension = "product" | "group" | "gedu";

/** What a detail page can be about: a dimension's row, or one gamer. */
export type FeedbackScopeKind = FeedbackDimension | "gamer";

export interface FeedbackScope {
  kind: FeedbackScopeKind;
  id: string;
}

/** The product a product or group belongs to. */
export interface FeedbackProductRef {
  id: string;
  name: string;
  type: ProductType;
  isRemote: boolean;
}

/** One point of a sparkline: the positive share of one week or month. */
export interface FeedbackSparkPoint {
  /** The bucket's first day: a Monday, or the 1st of a month. */
  start: string;
  /** The sample behind it (responses for the headline, answers for a statement). */
  n: number;
  /** `null` when nothing was answered in the bucket: the line gaps there. */
  positiveShare: number | null;
}

/** A figure this period, the same figure the period before, and the move between them. */
export interface ComparedFigure {
  current: ShareFigure;
  previous: ShareFigure;
  /** Positive share now minus before, in percentage points; `null` if either side had no answers. */
  changePoints: number | null;
}

/** The headline: positive share across every statement. */
export interface FeedbackHeadline extends ComparedFigure {
  /** The current period, bucket by bucket, oldest first. */
  series: FeedbackSparkPoint[];
}

/** One statement's line. `current.distribution` is its full 1–5 spread. */
export interface FeedbackStatementLine extends ComparedFigure {
  /** The catalogue key — also the statement's message key. */
  key: string;
  theme: SessionFeedbackTheme;
}

/** "N answers from X% of gamers present". */
export interface FeedbackParticipation {
  /** Responses in the period. */
  responses: number;
  /** Of those, the ones whose session's register marks the respondent present. */
  countedResponses: number;
  /** Gamers marked present at the scope's sessions; `null` for a gamer scope. */
  eligible: number | null;
  /** `countedResponses / eligible`; `null` when there is no denominator or it is 0. */
  responseRate: number | null;
}

/** One line of the overview per dimension, e.g. "2 below average". */
export interface FeedbackDimensionSummary {
  /** Rows the dimension's list would show. */
  rows: number;
  /** Rows whose positive share is below the platform's. */
  belowPlatform: number;
}

/**
 * The responses of a period as the "What gamers said" list reads them.
 *
 * **Worth reading** is a response with a low answer (No or Not really) on any
 * statement, or a note: the two ways a gamer tells an admin something needs
 * looking at. It is ordered by how much it says — a low answer with a note
 * explaining it, then a low answer alone, then a note alone — and newest first
 * within each, so the top of the list is the read most likely to need acting on.
 */
export interface FeedbackResponses {
  /** Every response in the period, newest first. */
  all: AdminFeedbackResponse[];
  /** The responses worth reading, in reading order. */
  worthReading: AdminFeedbackResponse[];
}

/** "8 worth reading · 412 responses". */
export interface FeedbackResponsesSummary {
  total: number;
  worthReading: number;
}

/** `/admin/feedback`: one source, one period, no lists. */
export interface FeedbackOverview {
  source: FeedbackSource;
  periods: FeedbackPeriods;
  bucketUnit: FeedbackBucketUnit;
  headline: FeedbackHeadline;
  participation: FeedbackParticipation;
  /** In the order the source asks them. */
  statements: FeedbackStatementLine[];
  dimensions: Record<FeedbackDimension, FeedbackDimensionSummary>;
  responses: FeedbackResponsesSummary;
}

/** The statement a row lags the platform on most. */
export interface FeedbackWeakestStatement {
  key: string;
  /** Row's positive share minus the platform's, in points; always negative. */
  gapPoints: number;
}

/**
 * One product, group or Gedu in a list. A row that ran sessions but heard
 * nothing back has no share: `belowPlatform` is false and `weakest` null.
 */
export interface FeedbackDimensionRow {
  dimension: FeedbackDimension;
  id: string;
  name: string;
  /** The row's own product, or a group's product; `null` for a Gedu. */
  product: FeedbackProductRef | null;
  /** Responses this period (a response with two Gedus counts toward each). */
  responses: number;
  eligible: number;
  responseRate: number | null;
  /** Positive share across every statement; `current.positiveShare` is what the list sorts on. */
  overall: ComparedFigure;
  /** The row's positive share is under the platform's. */
  belowPlatform: boolean;
  /** `null` when no statement is below the platform's share for it. */
  weakest: FeedbackWeakestStatement | null;
}

/** A dimension's list, worst first; rows with no answers last. */
export interface FeedbackDimensionList {
  source: FeedbackSource;
  periods: FeedbackPeriods;
  dimension: FeedbackDimension;
  /** The platform's overall figure the rows are judged against. */
  platform: ShareFigure;
  rows: FeedbackDimensionRow[];
}

/** How a scope's figure stands against the whole platform in the same period. */
export interface PlatformComparison {
  platform: ShareFigure;
  /** Scope minus platform, in points; `null` when either had no answers. */
  vsPlatformPoints: number | null;
  belowPlatform: boolean;
}

/**
 * A gamer is a child, read only against themselves over time, so a gamer's
 * detail has `againstPlatform: null` everywhere: the comparison is never built.
 */
export type FeedbackDetailHeadline = FeedbackHeadline & { againstPlatform: PlatformComparison | null };
export type FeedbackDetailStatement = FeedbackStatementLine & { againstPlatform: PlatformComparison | null };

/** A gamer under a group: who, and how often they answered. Never a score. */
export interface FeedbackGamerEntry {
  id: string;
  name: string;
  responses: number;
}

/**
 * The rows under a scope, `null` where that kind of child is not shown:
 * product → groups and Gedus; Gedu → groups; group → gamers; gamer → none.
 * Group and Gedu children are judged against the platform, exactly as list rows.
 */
export interface FeedbackDetailChildren {
  groups: FeedbackDimensionRow[] | null;
  gedus: FeedbackDimensionRow[] | null;
  /** Alphabetical, response count only — never ranked or scored. */
  gamers: FeedbackGamerEntry[] | null;
}

/** One product, group, Gedu or gamer. */
export interface FeedbackDetail {
  source: FeedbackSource;
  periods: FeedbackPeriods;
  scope: FeedbackScope;
  /** Looked up across the whole dataset; `null` when the id appears nowhere. */
  name: string | null;
  /** The product of a product or group scope; `null` otherwise. */
  product: FeedbackProductRef | null;
  bucketUnit: FeedbackBucketUnit;
  headline: FeedbackDetailHeadline;
  participation: FeedbackParticipation;
  statements: FeedbackDetailStatement[];
  children: FeedbackDetailChildren;
  responses: FeedbackResponses;
}

/** "What gamers said" across the whole platform. */
export interface FeedbackResponsesView {
  source: FeedbackSource;
  periods: FeedbackPeriods;
  responses: FeedbackResponses;
}

/* ------------------------------------------------------------------------ */
/* Builders                                                                 */
/* ------------------------------------------------------------------------ */

export function buildFeedbackOverview(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
  periods: FeedbackPeriods,
): FeedbackOverview {
  const slice = sliceOf(dataset, source, periods);
  const bucketUnit = bucketUnitFor(periods.current);
  const platform = comparedTallies(slice.current, slice.previous, source);
  const responses = responsesOf(slice.current);

  const summarise = (dimension: FeedbackDimension): FeedbackDimensionSummary => {
    const rows = dimensionRows(dimension, slice, source, platform.current);
    return {
      rows: rows.length,
      belowPlatform: rows.filter((row) => row.belowPlatform).length,
    };
  };

  return {
    source,
    periods,
    bucketUnit,
    headline: headlineOf(platform, slice.current, periods.current, bucketUnit),
    participation: participationOf(slice.current, slice.currentSessions),
    statements: statementLinesOf(platform, source),
    dimensions: {
      product: summarise("product"),
      group: summarise("group"),
      gedu: summarise("gedu"),
    },
    responses: { total: responses.all.length, worthReading: responses.worthReading.length },
  };
}

/**
 * Every product, group or Gedu that had a response or an eligible session in
 * the current period, worst first by its positive share.
 */
export function buildFeedbackDimensionList(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
  periods: FeedbackPeriods,
  dimension: FeedbackDimension,
): FeedbackDimensionList {
  const slice = sliceOf(dataset, source, periods);
  const platform = tallyResponses(slice.current, source);
  return {
    source,
    periods,
    dimension,
    platform: shareFigure(platform.overall),
    rows: dimensionRows(dimension, slice, source, platform),
  };
}

export function buildFeedbackDetail(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
  periods: FeedbackPeriods,
  scope: FeedbackScope,
): FeedbackDetail {
  const all = sliceOf(dataset, source, periods);
  const slice = narrow(all, scope);
  const bucketUnit = bucketUnitFor(periods.current);
  const platformTallies = tallyResponses(all.current, source);
  const scoped = comparedTallies(slice.current, slice.previous, source);

  const headline = headlineOf(scoped, slice.current, periods.current, bucketUnit);
  const comparable = scope.kind !== "gamer";

  const statements = statementLinesOf(scoped, source).map(
    (line) => ({
      ...line,
      againstPlatform: comparable
        ? compareWithPlatform(line.current, statementFigure(platformTallies, line.key))
        : null,
    }),
  );

  const childRows = (dimension: FeedbackDimension) =>
    dimensionRows(dimension, slice, source, platformTallies);

  return {
    source,
    periods,
    scope,
    name: nameOf(dataset, scope),
    product: productOf(dataset, scope),
    bucketUnit,
    headline: {
      ...headline,
      againstPlatform: comparable
        ? compareWithPlatform(headline.current, shareFigure(platformTallies.overall))
        : null,
    },
    participation:
      scope.kind === "gamer"
        ? { ...participationOf(slice.current, []), eligible: null, responseRate: null }
        : participationOf(slice.current, slice.currentSessions),
    statements,
    children: {
      groups: scope.kind === "product" || scope.kind === "gedu" ? childRows("group") : null,
      gedus: scope.kind === "product" ? childRows("gedu") : null,
      gamers: scope.kind === "group" ? gamersOf(slice.current) : null,
    },
    responses: responsesOf(slice.current),
  };
}

export function buildFeedbackResponses(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
  periods: FeedbackPeriods,
): FeedbackResponsesView {
  return { source, periods, responses: responsesOf(sliceOf(dataset, source, periods).current) };
}

/** The rows one source contributed. */
function ofSource<T extends { source: FeedbackSource }>(
  rows: readonly T[],
  source: FeedbackSource,
): T[] {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- constant only while FEEDBACK_SOURCES has a single member; with a second source it is the partition
  return rows.filter((row) => row.source === source);
}

/* ------------------------------------------------------------------------ */
/* Slicing                                                                  */
/* ------------------------------------------------------------------------ */

/** One source's entries, split into the two periods. */
interface Slice {
  current: AdminFeedbackResponse[];
  previous: AdminFeedbackResponse[];
  currentSessions: AdminFeedbackSession[];
}

function sliceOf(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
  periods: FeedbackPeriods,
): Slice {
  const responses = ofSource(dataset.responses, source);
  return {
    current: responses.filter((row) => inPeriod(row.sessionDate, periods.current)),
    previous: responses.filter((row) => inPeriod(row.sessionDate, periods.previous)),
    currentSessions: ofSource(dataset.sessions, source).filter((row) =>
      inPeriod(row.sessionDate, periods.current),
    ),
  };
}

function inScope(
  row: AdminFeedbackResponse | AdminFeedbackSession,
  scope: FeedbackScope,
): boolean {
  switch (scope.kind) {
    case "product":
      return row.productId === scope.id;
    case "group":
      return row.groupId === scope.id;
    case "gedu":
      return row.gedus.some((gedu) => gedu.id === scope.id);
    case "gamer":
      return "respondent" in row && row.respondent.id === scope.id;
  }
}

function narrow(slice: Slice, scope: FeedbackScope): Slice {
  return {
    current: slice.current.filter((row) => inScope(row, scope)),
    previous: slice.previous.filter((row) => inScope(row, scope)),
    // Sessions do not say which gamers were present, so a gamer has no denominator.
    currentSessions:
      scope.kind === "gamer" ? [] : slice.currentSessions.filter((row) => inScope(row, scope)),
  };
}

/* ------------------------------------------------------------------------ */
/* Figures                                                                  */
/* ------------------------------------------------------------------------ */

interface ComparedTallies {
  current: ResponseTallies;
  previous: ResponseTallies;
}

function comparedTallies(
  current: readonly AdminFeedbackResponse[],
  previous: readonly AdminFeedbackResponse[],
  source: FeedbackSource,
): ComparedTallies {
  return { current: tallyResponses(current, source), previous: tallyResponses(previous, source) };
}

function compared(current: Tally, previous: Tally): ComparedFigure {
  const now = shareFigure(current);
  const before = shareFigure(previous);
  return { current: now, previous: before, changePoints: pointsBetween(now, before) };
}

function statementFigure(tallies: ResponseTallies, key: string): ShareFigure {
  return shareFigure(tallies.statements.get(key) ?? emptyTally());
}

function compareWithPlatform(scope: ShareFigure, platform: ShareFigure): PlatformComparison {
  return {
    platform,
    vsPlatformPoints: pointsBetween(scope, platform),
    belowPlatform: isBelow(scope, platform),
  };
}

/** The current period's positive share across every statement, bucket by bucket. */
function seriesOf(
  responses: readonly AdminFeedbackResponse[],
  period: FeedbackPeriod,
  unit: FeedbackBucketUnit,
): FeedbackSparkPoint[] {
  const buckets = new Map(bucketStarts(period, unit).map((start) => [start, emptyTally()]));
  for (const response of responses) {
    const tally = buckets.get(bucketStartOf(response.sessionDate, unit));
    if (tally === undefined) continue;
    addRatings(tally, knownAnswers(response).map(({ rating }) => rating));
  }
  return [...buckets].map(([start, tally]) => {
    const figure = shareFigure(tally);
    return { start, n: figure.n, positiveShare: figure.positiveShare };
  });
}

function headlineOf(
  tallies: ComparedTallies,
  responses: readonly AdminFeedbackResponse[],
  period: FeedbackPeriod,
  unit: FeedbackBucketUnit,
): FeedbackHeadline {
  return {
    ...compared(tallies.current.overall, tallies.previous.overall),
    series: seriesOf(responses, period, unit),
  };
}

function statementLinesOf(tallies: ComparedTallies, source: FeedbackSource): FeedbackStatementLine[] {
  return FEEDBACK_CATALOGUES[source].map(({ key, theme }) => ({
    key,
    theme,
    ...compared(
      tallies.current.statements.get(key) ?? emptyTally(),
      tallies.previous.statements.get(key) ?? emptyTally(),
    ),
  }));
}

function participationOf(
  responses: readonly AdminFeedbackResponse[],
  sessions: readonly AdminFeedbackSession[],
): FeedbackParticipation {
  const countedResponses = responses.filter((row) => row.countsTowardRate).length;
  const eligible = sessions.reduce((sum, row) => sum + row.eligibleCount, 0);
  return {
    responses: responses.length,
    countedResponses,
    eligible,
    responseRate: eligible === 0 ? null : countedResponses / eligible,
  };
}

/* ------------------------------------------------------------------------ */
/* Dimension rows                                                           */
/* ------------------------------------------------------------------------ */

interface RowKey {
  id: string;
  name: string;
  product: FeedbackProductRef | null;
}

function productRefOf(row: AdminFeedbackGroupRef): FeedbackProductRef {
  return { id: row.productId, name: row.productName, type: row.productType, isRemote: row.isRemote };
}

/** The rows an entry counts toward. A Gedu listed twice on one session counts once. */
function rowKeysOf(
  row: AdminFeedbackGroupRef & { gedus: AdminFeedbackGedu[] },
  dimension: FeedbackDimension,
): RowKey[] {
  switch (dimension) {
    case "product":
      return [{ id: row.productId, name: row.productName, product: productRefOf(row) }];
    case "group":
      return [{ id: row.groupId, name: row.groupName, product: productRefOf(row) }];
    case "gedu": {
      const seen = new Set<string>();
      return row.gedus.flatMap((gedu) => {
        if (seen.has(gedu.id)) return [];
        seen.add(gedu.id);
        return [{ id: gedu.id, name: gedu.name, product: null }];
      });
    }
  }
}

interface RowAccumulator extends RowKey {
  current: AdminFeedbackResponse[];
  previous: AdminFeedbackResponse[];
  eligible: number;
}

/**
 * One dimension's rows over a slice, judged against the platform's tallies.
 * A row is opened by a current response or a current session — a group that
 * ran sessions and heard nothing back is listed — never by the previous period
 * alone.
 */
function dimensionRows(
  dimension: FeedbackDimension,
  slice: Slice,
  source: FeedbackSource,
  platform: ResponseTallies,
): FeedbackDimensionRow[] {
  const rows = new Map<string, RowAccumulator>();
  const open = (key: RowKey): RowAccumulator => {
    let row = rows.get(key.id);
    if (row === undefined) {
      row = { ...key, current: [], previous: [], eligible: 0 };
      rows.set(key.id, row);
    }
    return row;
  };

  for (const response of slice.current) {
    for (const key of rowKeysOf(response, dimension)) open(key).current.push(response);
  }
  for (const session of slice.currentSessions) {
    for (const key of rowKeysOf(session, dimension)) open(key).eligible += session.eligibleCount;
  }
  for (const response of slice.previous) {
    for (const key of rowKeysOf(response, dimension)) rows.get(key.id)?.previous.push(response);
  }

  const platformOverall = shareFigure(platform.overall);
  return [...rows.values()]
    .map((row): FeedbackDimensionRow => {
      const tallies = comparedTallies(row.current, row.previous, source);
      const overall = compared(tallies.current.overall, tallies.previous.overall);
      const counted = row.current.filter((response) => response.countsTowardRate).length;
      return {
        dimension,
        id: row.id,
        name: row.name,
        product: row.product,
        responses: row.current.length,
        eligible: row.eligible,
        responseRate: row.eligible === 0 ? null : counted / row.eligible,
        overall,
        belowPlatform: isBelow(overall.current, platformOverall),
        weakest: weakestStatement(tallies.current, platform, source),
      };
    })
    .sort(worstFirst);
}

/** The statement furthest below the platform's share for it, if any is below. */
function weakestStatement(
  scope: ResponseTallies,
  platform: ResponseTallies,
  source: FeedbackSource,
): FeedbackWeakestStatement | null {
  let weakest: FeedbackWeakestStatement | null = null;
  for (const { key } of FEEDBACK_CATALOGUES[source]) {
    const gapPoints = pointsBetween(statementFigure(scope, key), statementFigure(platform, key));
    if (gapPoints !== null && gapPoints < 0 && (weakest === null || gapPoints < weakest.gapPoints)) {
      weakest = { key, gapPoints };
    }
  }
  return weakest;
}

/**
 * By positive share, ascending; ties by name, then id. A row with no answers
 * has no share and goes last.
 */
function worstFirst(a: FeedbackDimensionRow, b: FeedbackDimensionRow): number {
  const aShare = a.overall.current.positiveShare;
  const bShare = b.overall.current.positiveShare;
  if ((aShare === null) !== (bShare === null)) return aShare === null ? 1 : -1;
  return (
    (aShare ?? 0) - (bShare ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  );
}

/* ------------------------------------------------------------------------ */
/* People, responses, names                                                     */
/* ------------------------------------------------------------------------ */

function gamersOf(responses: readonly AdminFeedbackResponse[]): FeedbackGamerEntry[] {
  const gamers = new Map<string, FeedbackGamerEntry>();
  for (const { respondent } of responses) {
    const entry = gamers.get(respondent.id);
    if (entry === undefined) {
      gamers.set(respondent.id, { id: respondent.id, name: respondent.name, responses: 1 });
    } else {
      entry.responses += 1;
    }
  }
  return [...gamers.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function newestFirst(a: AdminFeedbackResponse, b: AdminFeedbackResponse): number {
  return b.sessionDate.localeCompare(a.sessionDate) || b.submittedAt.localeCompare(a.submittedAt);
}

/** Why a response is worth reading, most telling first: the list is grouped in this order. */
const READING_ORDER = ["lowAndNote", "low", "note"] as const;

type ReadingReason = (typeof READING_ORDER)[number];

/** Why a response is worth reading, or `null` when it is not. */
function readingReasonOf(response: AdminFeedbackResponse): ReadingReason | null {
  const low = hasLowAnswer(response);
  const note = hasNote(response);
  if (low) return note ? "lowAndNote" : "low";
  return note ? "note" : null;
}

function responsesOf(responses: readonly AdminFeedbackResponse[]): FeedbackResponses {
  const all = [...responses].sort(newestFirst);
  return {
    all,
    // Filtering the newest-first list once per reason keeps each group newest first.
    worthReading: READING_ORDER.flatMap((reason) =>
      all.filter((response) => readingReasonOf(response) === reason),
    ),
  };
}

/** Every entry of the dataset, any source and period: a name outlives the range it was seen in. */
function entriesOf(dataset: AdminFeedbackDataset) {
  return [...dataset.responses, ...dataset.sessions];
}

function nameOf(dataset: AdminFeedbackDataset, scope: FeedbackScope): string | null {
  for (const entry of entriesOf(dataset)) {
    switch (scope.kind) {
      case "product":
        if (entry.productId === scope.id) return entry.productName;
        break;
      case "group":
        if (entry.groupId === scope.id) return entry.groupName;
        break;
      case "gedu": {
        const gedu = entry.gedus.find((candidate) => candidate.id === scope.id);
        if (gedu !== undefined) return gedu.name;
        break;
      }
      case "gamer":
        if ("respondent" in entry && entry.respondent.id === scope.id) return entry.respondent.name;
        break;
    }
  }
  return null;
}

function productOf(dataset: AdminFeedbackDataset, scope: FeedbackScope): FeedbackProductRef | null {
  if (scope.kind !== "product" && scope.kind !== "group") return null;
  const entry = entriesOf(dataset).find((row) =>
    scope.kind === "product" ? row.productId === scope.id : row.groupId === scope.id,
  );
  return entry === undefined ? null : productRefOf(entry);
}
