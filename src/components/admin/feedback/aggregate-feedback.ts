import type {
  AdminFeedbackDataset,
  AdminFeedbackGedu,
  AdminFeedbackGroupRef,
  AdminFeedbackResponse,
  AdminFeedbackSession,
  FeedbackSource,
} from "@/services/session-feedback/admin-feedback.contracts";
import { addCalendarDays } from "@/lib/calendar-date";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import type { ProductType } from "@/types";
import {
  addRatings,
  bucketStartOf,
  bucketStarts,
  bucketUnitFor,
  emptyTally,
  stepBuckets,
  hasNegativeAnswer,
  hasNote,
  isBelow,
  knownAnswers,
  pointsBetween,
  shareFigure,
  tallyResponses,
  type FeedbackBucketUnit,
  type FeedbackPeriod,
  type ResponseTallies,
  type ShareFigure,
} from "./feedback-tally";
import { FEEDBACK_CATALOGUES } from "./feedback-sources";

export {
  bucketUnitFor,
  type FeedbackPeriod,
  type ShareFigure,
} from "./feedback-tally";

/**
 * **The feedback page's arithmetic** — pure passes from the dataset the route
 * read to the view model of each of the page's four views: the overview, a
 * dimension's list, one scope's detail, and what gamers said.
 *
 * Every figure covers the whole history, from the first day a gamer answered
 * to today: there is no period to pick and nothing to compare it with but the
 * platform. A session before the first answer predates the feedback prompt, so
 * it counts toward no denominator and opens no row. Every figure is per
 * source. Below the overview a detail's headline and every breakdown row are
 * set against the platform's; a gamer's carry no platform figure at all. Nothing here knows about React, the URL or the locale: ids
 * and message-key-shaped values out, labels are the UI's.
 */

/** What every feedback page is handed by its route. */
export interface FeedbackRead {
  /** The one source collected today. */
  source: FeedbackSource;
  /** Every session day from the read's floor to today. */
  dataset: AdminFeedbackDataset;
  /** The days the timeline draws: the first answer's session day to today. */
  history: FeedbackPeriod;
}

/** What a breakdown's rows can be: a product, a group or a Gedu. */
export type FeedbackDimension = "product" | "group" | "gedu";

/**
 * The dimensions with a list of their own, each a door on the overview. A
 * group has none: it is only ever a product's breakdown, shown where the
 * product ran more than one.
 */
export type FeedbackListDimension = Exclude<FeedbackDimension, "group">;

/** What a detail page can be about: a dimension's row, or one gamer. */
export type FeedbackScopeKind = FeedbackDimension | "gamer";

export interface FeedbackScope {
  kind: FeedbackScopeKind;
  id: string;
}

/** The product a product or group belongs to. */
export interface FeedbackProductRef {
  id: string;
  type: ProductType;
}

/** One point of the timeline: the positive share of one week or month. */
export interface FeedbackTimelinePoint {
  /** The bucket's first day inside the history: a Monday or a 1st, unless the history starts later. */
  start: string;
  /** The bucket's last day inside the history. */
  end: string;
  /** Responses behind it. */
  n: number;
  /** `null` when nothing was answered in the bucket: the line gaps there. */
  positiveShare: number | null;
}

/**
 * **The whole history, bucket by bucket**: the scope's line and, on a detail
 * page set against the platform, the platform's line beside it.
 */
export interface FeedbackTimeline {
  unit: FeedbackBucketUnit;
  /** Oldest first. */
  points: FeedbackTimelinePoint[];
  /** The platform's points at the same buckets; `null` on the overview and for a gamer. */
  platform: FeedbackTimelinePoint[] | null;
}

/** One statement's line. `figure.distribution` is its full 1–5 spread. */
export interface FeedbackStatementLine {
  /** The catalogue key — also the statement's message key. */
  key: string;
  figure: ShareFigure;
}

/** "N answers from X% of gamers present". */
export interface FeedbackParticipation {
  responses: number;
  /** Of those, the ones whose session's register marks the respondent present. */
  countedResponses: number;
  /** Gamers marked present at the scope's sessions; `null` for a gamer scope. */
  eligible: number | null;
  /** `countedResponses / eligible`; `null` when there is no denominator or it is 0. */
  responseRate: number | null;
}

/** One line of the overview per list, e.g. "12 products". */
export interface FeedbackDimensionSummary {
  /** Rows the dimension's list would show. */
  rows: number;
}

/**
 * The responses as the "What gamers said" list reads them.
 *
 * **Worth reading** is a response with a negative answer (No or Not really) on any
 * statement, or a note: the two ways a gamer tells an admin something needs
 * looking at. It is ordered by how much it says — a negative answer with a note
 * explaining it, then a negative answer alone, then a note alone — and newest first
 * within each, so the top of the list is the read most likely to need acting on.
 */
export interface FeedbackResponses {
  /** Every response, newest first. */
  all: AdminFeedbackResponse[];
  /** The responses worth reading, in reading order. */
  worthReading: AdminFeedbackResponse[];
  /** For naming each response's group by `feedbackGroupTarget`. */
  groupsPerProduct: FeedbackGroupsPerProduct;
}

/** "412 responses". */
export interface FeedbackResponsesSummary {
  total: number;
}

/** `/admin/feedback`: one source, no lists. */
export interface FeedbackOverview {
  source: FeedbackSource;
  /** Positive share across every statement. */
  headline: ShareFigure;
  participation: FeedbackParticipation;
  /** In the order the source asks them. */
  statements: FeedbackStatementLine[];
  dimensions: Record<FeedbackListDimension, FeedbackDimensionSummary>;
  responses: FeedbackResponsesSummary;
}

/** The statement a row lags the platform on most. */
export interface FeedbackWeakestStatement {
  key: string;
  /** Row's positive share minus the platform's, in points; always negative. */
  gapPoints: number;
}

/**
 * One product, group or Gedu in a list or a breakdown. A row that ran sessions
 * but heard nothing back has no share: `belowPlatform` is false and `weakest`
 * null.
 */
export interface FeedbackDimensionRow {
  /** The product's, group's or Gedu's own id: what the row counts. */
  id: string;
  /** A group's is its `feedbackGroupTarget` name. */
  name: string;
  /** The page the row opens: a group's is its `feedbackGroupTarget` scope. */
  scope: FeedbackScope;
  /** Responses (a response with two Gedus counts toward each). */
  responses: number;
  /** Positive share across every statement; its `positiveShare` is what the list sorts on. */
  overall: ShareFigure;
  /** The row's positive share is under the platform's. */
  belowPlatform: boolean;
  /** `null` when no statement is below the platform's share for it. */
  weakest: FeedbackWeakestStatement | null;
}

/** A dimension's list, worst first; rows with no answers last. */
export interface FeedbackDimensionList {
  source: FeedbackSource;
  dimension: FeedbackListDimension;
  /** The platform's overall figure the rows are judged against. */
  platform: ShareFigure;
  rows: FeedbackDimensionRow[];
}

/** How a scope's figure stands against the whole platform. */
export interface PlatformComparison {
  platform: ShareFigure;
  belowPlatform: boolean;
}

/** A gamer under a group: who, and how often they answered. Never a score. */
export interface FeedbackGamerEntry {
  id: string;
  name: string;
  responses: number;
}

/**
 * The rows under a scope, `null` where that kind of child is not shown. A
 * product breaks down by Gedu and — only when it ran more than one group — by
 * group; with one group, the product and the group are the same thing, so the
 * product lists that group's gamers itself. A Gedu breaks down by the groups
 * they taught, each named by `feedbackGroupTarget`, so a single-group product
 * reads as the product. A group lists its gamers; a gamer has no children.
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
  scope: FeedbackScope;
  /**
   * Looked up across the whole dataset — a group's is its `feedbackGroupTarget`
   * name; `null` when the id appears nowhere.
   */
  name: string | null;
  /** The product of a product or group scope; `null` otherwise. */
  product: FeedbackProductRef | null;
  headline: ShareFigure;
  /**
   * The headline against the platform's; `null` for a gamer, a child read only
   * against themselves over time.
   */
  againstPlatform: PlatformComparison | null;
  participation: FeedbackParticipation;
  /** In the order the source asks them. */
  statements: FeedbackStatementLine[];
  children: FeedbackDetailChildren;
  responses: FeedbackResponses;
}

/** "What gamers said" across the whole platform. */
export interface FeedbackResponsesView {
  source: FeedbackSource;
  responses: FeedbackResponses;
}

/* ------------------------------------------------------------------------ */
/* Builders                                                                 */
/* ------------------------------------------------------------------------ */

export function buildFeedbackOverview(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
): FeedbackOverview {
  const slice = sliceOf(dataset, source);
  const platform = tallyResponses(slice.responses, source);
  const groups = groupsPerProductOf(slice);
  const responses = responsesOf(slice.responses, groups);

  const summarise = (dimension: FeedbackListDimension): FeedbackDimensionSummary => ({
    rows: dimensionRows(dimension, slice, source, platform, groups).length,
  });

  return {
    source,
    headline: shareFigure(platform.overall),
    participation: participationOf(slice.responses, slice.sessions),
    statements: statementLinesOf(platform, source),
    dimensions: {
      product: summarise("product"),
      gedu: summarise("gedu"),
    },
    responses: { total: responses.all.length },
  };
}

/**
 * Every product or Gedu that had a response or an eligible session, worst
 * first by its positive share.
 */
export function buildFeedbackDimensionList(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
  dimension: FeedbackListDimension,
): FeedbackDimensionList {
  const slice = sliceOf(dataset, source);
  const platform = tallyResponses(slice.responses, source);
  return {
    source,
    dimension,
    platform: shareFigure(platform.overall),
    rows: dimensionRows(dimension, slice, source, platform, groupsPerProductOf(slice)),
  };
}

export function buildFeedbackDetail(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
  scope: FeedbackScope,
): FeedbackDetail {
  const all = sliceOf(dataset, source);
  const groups = groupsPerProductOf(all);
  const slice = narrow(all, scope);
  const platformTallies = tallyResponses(all.responses, source);
  const scoped = tallyResponses(slice.responses, source);
  const headline = shareFigure(scoped.overall);
  const comparable = scope.kind !== "gamer";

  const childRows = (dimension: FeedbackDimension) =>
    dimensionRows(dimension, slice, source, platformTallies, groups);
  const productOfManyGroups = scope.kind === "product" && (groups.get(scope.id) ?? 0) > 1;

  return {
    source,
    scope,
    name: nameOf(dataset, scope, groups),
    product: productOf(dataset, scope),
    headline,
    againstPlatform: comparable
      ? compareWithPlatform(headline, shareFigure(platformTallies.overall))
      : null,
    participation:
      scope.kind === "gamer"
        ? { ...participationOf(slice.responses, []), eligible: null, responseRate: null }
        : participationOf(slice.responses, slice.sessions),
    statements: statementLinesOf(scoped, source),
    children: {
      groups: productOfManyGroups || scope.kind === "gedu" ? childRows("group") : null,
      gedus: scope.kind === "product" ? childRows("gedu") : null,
      gamers:
        scope.kind === "group" || (scope.kind === "product" && !productOfManyGroups)
          ? gamersOf(slice.responses)
          : null,
    },
    responses: responsesOf(slice.responses, groups),
  };
}

export function buildFeedbackResponses(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
): FeedbackResponsesView {
  const slice = sliceOf(dataset, source);
  return { source, responses: responsesOf(slice.responses, groupsPerProductOf(slice)) };
}

/* ------------------------------------------------------------------------ */
/* Groups and their products                                                */
/* ------------------------------------------------------------------------ */

/**
 * How many groups each product ran over the history, by product id: a group
 * counts when it had a response or an eligible session there. A product absent
 * from it ran none the history saw.
 */
export type FeedbackGroupsPerProduct = ReadonlyMap<string, number>;

/** Where a group is opened, and what it is called wherever it is linked or named. */
export interface FeedbackGroupTarget {
  scope: FeedbackScope;
  name: string;
}

/**
 * **The one rule for linking and naming a group.** A product is the entry
 * point, and its groups are a breakdown only when there is more than one of
 * them: a group of a single-group product *is* the product, so it opens the
 * product's page and is named by the product alone; a group of a multi-group
 * product opens its own page and is named "Product · Group".
 */
export function feedbackGroupTarget(
  group: Pick<AdminFeedbackGroupRef, "groupId" | "groupName" | "productId" | "productName">,
  groupsPerProduct: FeedbackGroupsPerProduct,
): FeedbackGroupTarget {
  return (groupsPerProduct.get(group.productId) ?? 0) > 1
    ? {
        scope: { kind: "group", id: group.groupId },
        name: [group.productName, group.groupName].join(SCHEDULE_PART_SEPARATOR),
      }
    : { scope: { kind: "product", id: group.productId }, name: group.productName };
}

export function feedbackGroupsPerProduct(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
): FeedbackGroupsPerProduct {
  return groupsPerProductOf(sliceOf(dataset, source));
}

/**
 * The page a scope is read on: a group of a single-group product is read on
 * its product's page, so an address to its own page — typed, or kept from
 * before the product's other groups ended — lands there. Every other scope,
 * and a group the dataset has never seen, is read on its own.
 */
export function feedbackCanonicalScope(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
  scope: FeedbackScope,
): FeedbackScope {
  if (scope.kind !== "group") return scope;
  const entry = entriesOf(dataset).find((row) => row.groupId === scope.id);
  return entry === undefined
    ? scope
    : feedbackGroupTarget(entry, feedbackGroupsPerProduct(dataset, source)).scope;
}

function groupsPerProductOf(slice: Slice): Map<string, number> {
  const groups = new Map<string, Set<string>>();
  for (const { productId, groupId } of [...slice.responses, ...slice.sessions]) {
    const ofProduct = groups.get(productId) ?? new Set<string>();
    ofProduct.add(groupId);
    groups.set(productId, ofProduct);
  }
  return new Map([...groups].map(([productId, ids]) => [productId, ids.size]));
}

/**
 * The scope's line over the whole history (the platform's own when `scope` is
 * `null`) and, for a scope set against the platform, the platform's line
 * beside it.
 */
export function buildFeedbackTimeline(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
  history: FeedbackPeriod,
  scope: FeedbackScope | null,
): FeedbackTimeline {
  const unit = bucketUnitFor(history);
  const all = ofSource(dataset.responses, source);
  const platform = seriesOf(all, history, unit);
  if (scope === null) return { unit, points: platform, platform: null };
  return {
    unit,
    points: seriesOf(
      all.filter((row) => inScope(row, scope)),
      history,
      unit,
    ),
    platform: scope.kind === "gamer" ? null : platform,
  };
}

/**
 * The days the pages read: from the session day of the source's first answer
 * to today — just today when nobody has answered. Recorded sessions never move
 * the start: the read returns sessions from before the feedback prompt existed.
 */
export function feedbackHistory(
  dataset: AdminFeedbackDataset,
  source: FeedbackSource,
  today: string,
): FeedbackPeriod {
  const first = firstAnswerDay(ofSource(dataset.responses, source));
  return { from: first === null || first > today ? today : first, to: today };
}

/** The earliest session day among `responses`; `null` when there are none. */
function firstAnswerDay(responses: readonly AdminFeedbackResponse[]): string | null {
  let first: string | null = null;
  for (const { sessionDate } of responses) {
    if (first === null || sessionDate < first) first = sessionDate;
  }
  return first;
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

/**
 * One source's entries over its history: a session before the first answer
 * predates the prompt, so it is dropped — and with no answer at all, every
 * session is.
 */
interface Slice {
  responses: AdminFeedbackResponse[];
  sessions: AdminFeedbackSession[];
}

function sliceOf(dataset: AdminFeedbackDataset, source: FeedbackSource): Slice {
  const responses = ofSource(dataset.responses, source);
  const first = firstAnswerDay(responses);
  return {
    responses,
    sessions:
      first === null ? [] : ofSource(dataset.sessions, source).filter((row) => row.sessionDate >= first),
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
    responses: slice.responses.filter((row) => inScope(row, scope)),
    // Sessions do not say which gamers were present, so a gamer has no denominator.
    sessions: scope.kind === "gamer" ? [] : slice.sessions.filter((row) => inScope(row, scope)),
  };
}

/* ------------------------------------------------------------------------ */
/* Figures                                                                  */
/* ------------------------------------------------------------------------ */

function statementFigure(tallies: ResponseTallies, key: string): ShareFigure {
  return shareFigure(tallies.statements.get(key) ?? emptyTally());
}

function compareWithPlatform(scope: ShareFigure, platform: ShareFigure): PlatformComparison {
  return {
    platform,
    belowPlatform: isBelow(scope, platform),
  };
}

/**
 * The positive share across every statement, bucket by bucket over the whole
 * history. A bucket the history cuts at either end is drawn for the days it
 * holds, so its point sits over them rather than over days never read.
 */
function seriesOf(
  responses: readonly AdminFeedbackResponse[],
  history: FeedbackPeriod,
  unit: FeedbackBucketUnit,
): FeedbackTimelinePoint[] {
  const buckets = new Map(bucketStarts(history, unit).map((start) => [start, emptyTally()]));
  for (const response of responses) {
    const tally = buckets.get(bucketStartOf(response.sessionDate, unit));
    if (tally === undefined) continue;
    addRatings(tally, knownAnswers(response).map(({ rating }) => rating));
  }
  return [...buckets].map(([start, tally]) => {
    const figure = shareFigure(tally);
    const end = addCalendarDays(stepBuckets(start, unit, 1), -1);
    return {
      start: start < history.from ? history.from : start,
      end: end > history.to ? history.to : end,
      n: figure.n,
      positiveShare: figure.positiveShare,
    };
  });
}

function statementLinesOf(tallies: ResponseTallies, source: FeedbackSource): FeedbackStatementLine[] {
  return FEEDBACK_CATALOGUES[source].map(({ key }) => ({
    key,
    figure: statementFigure(tallies, key),
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
  scope: FeedbackScope;
}

function productRefOf(row: AdminFeedbackGroupRef): FeedbackProductRef {
  return { id: row.productId, type: row.productType };
}

/** The rows an entry counts toward. A Gedu listed twice on one session counts once. */
function rowKeysOf(
  row: AdminFeedbackGroupRef & { gedus: AdminFeedbackGedu[] },
  dimension: FeedbackDimension,
  groupsPerProduct: FeedbackGroupsPerProduct,
): RowKey[] {
  switch (dimension) {
    case "product":
      return [
        { id: row.productId, name: row.productName, scope: { kind: "product", id: row.productId } },
      ];
    case "group":
      return [{ id: row.groupId, ...feedbackGroupTarget(row, groupsPerProduct) }];
    case "gedu": {
      const seen = new Set<string>();
      return row.gedus.flatMap((gedu) => {
        if (seen.has(gedu.id)) return [];
        seen.add(gedu.id);
        return [{ id: gedu.id, name: gedu.name, scope: { kind: "gedu", id: gedu.id } }];
      });
    }
  }
}

interface RowAccumulator extends RowKey {
  responses: AdminFeedbackResponse[];
}

/**
 * One dimension's rows over a slice, judged against the platform's tallies.
 * A row is opened by a response or a session: a group that ran sessions and
 * heard nothing back is listed.
 */
function dimensionRows(
  dimension: FeedbackDimension,
  slice: Slice,
  source: FeedbackSource,
  platform: ResponseTallies,
  groupsPerProduct: FeedbackGroupsPerProduct,
): FeedbackDimensionRow[] {
  const rows = new Map<string, RowAccumulator>();
  const open = (key: RowKey): RowAccumulator => {
    let row = rows.get(key.id);
    if (row === undefined) {
      row = { ...key, responses: [] };
      rows.set(key.id, row);
    }
    return row;
  };

  for (const response of slice.responses) {
    for (const key of rowKeysOf(response, dimension, groupsPerProduct)) {
      open(key).responses.push(response);
    }
  }
  for (const session of slice.sessions) {
    for (const key of rowKeysOf(session, dimension, groupsPerProduct)) {
      open(key);
    }
  }

  const platformOverall = shareFigure(platform.overall);
  return [...rows.values()]
    .map((row): FeedbackDimensionRow => {
      const tallies = tallyResponses(row.responses, source);
      const overall = shareFigure(tallies.overall);
      return {
        id: row.id,
        name: row.name,
        scope: row.scope,
        responses: row.responses.length,
        overall,
        belowPlatform: isBelow(overall, platformOverall),
        weakest: weakestStatement(tallies, platform, source),
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
  const aShare = a.overall.positiveShare;
  const bShare = b.overall.positiveShare;
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
const READING_ORDER = ["negativeAndNote", "negative", "note"] as const;

type ReadingReason = (typeof READING_ORDER)[number];

/** Why a response is worth reading, or `null` when it is not. */
function readingReasonOf(response: AdminFeedbackResponse): ReadingReason | null {
  const negative = hasNegativeAnswer(response);
  const note = hasNote(response);
  if (negative) return note ? "negativeAndNote" : "negative";
  return note ? "note" : null;
}

function responsesOf(
  responses: readonly AdminFeedbackResponse[],
  groupsPerProduct: FeedbackGroupsPerProduct,
): FeedbackResponses {
  const all = [...responses].sort(newestFirst);
  return {
    all,
    groupsPerProduct,
    // Filtering the newest-first list once per reason keeps each group newest first.
    worthReading: READING_ORDER.flatMap((reason) =>
      all.filter((response) => readingReasonOf(response) === reason),
    ),
  };
}

/** Every entry of the dataset, any source: a name is found wherever it was seen. */
function entriesOf(dataset: AdminFeedbackDataset) {
  return [...dataset.responses, ...dataset.sessions];
}

function nameOf(
  dataset: AdminFeedbackDataset,
  scope: FeedbackScope,
  groupsPerProduct: FeedbackGroupsPerProduct,
): string | null {
  for (const entry of entriesOf(dataset)) {
    switch (scope.kind) {
      case "product":
        if (entry.productId === scope.id) return entry.productName;
        break;
      case "group":
        if (entry.groupId === scope.id) return feedbackGroupTarget(entry, groupsPerProduct).name;
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
