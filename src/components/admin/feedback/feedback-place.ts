import type { ComponentProps } from "react";
import type { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import type { FeedbackDimension, FeedbackScope, FeedbackScopeKind } from "./aggregate-feedback";
import {
  DEFAULT_FEEDBACK_RANGE,
  FEEDBACK_RANGE_PARAM,
  type FeedbackRange,
} from "./feedback-range";

/** A link target the app's own typed `Link` accepts. */
export type FeedbackHref = ComponentProps<typeof Link>["href"];

/**
 * Where a detail page was opened from, so its back link returns there: a
 * list, the notes, or another detail (a product's group, a group's gamer).
 */
export type FeedbackOrigin =
  | { kind: "list"; dimension: FeedbackDimension }
  | { kind: "notes"; lowAnswerOnly: boolean }
  | { kind: "detail"; scope: FeedbackScope };

/**
 * **One page of the feedback section**, as data. Every link between the pages
 * is built from a place and the range on show, so the live routes and the
 * preview scene differ only in the one function that turns a place into a URL.
 */
export type FeedbackPlace =
  | { view: "overview" }
  | { view: "list"; dimension: FeedbackDimension }
  | { view: "detail"; scope: FeedbackScope; origin: FeedbackOrigin | null }
  | { view: "notes"; lowAnswerOnly: boolean };

/** Turns a place, at a range, into a link target. */
export type FeedbackHrefBuilder = (place: FeedbackPlace, range: FeedbackRange) => FeedbackHref;

/** The query parameter a detail page's origin travels in. */
export const FEEDBACK_ORIGIN_PARAM = "from";

/** The query parameter that widens the notes page to every note. */
export const FEEDBACK_NOTES_PARAM = "show";
const ALL_NOTES = "all";

/** The origin tokens of the notes page, filtered and widened. */
const NOTES_TOKEN = "notes";
const ALL_NOTES_TOKEN = "notes-all";

const DIMENSION_TOKENS = {
  product: "products",
  group: "groups",
  gedu: "gedus",
} as const satisfies Record<FeedbackDimension, string>;

const DIMENSIONS: readonly FeedbackDimension[] = ["product", "group", "gedu"];
const SCOPE_KINDS: readonly FeedbackScopeKind[] = [...DIMENSIONS, "gamer"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a route's id could name anything at all: every id here is a uuid. */
export function isFeedbackId(id: string): boolean {
  return UUID.test(id);
}

function firstOf(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * The origin a `?from=` value names, or `null` for anything else — an unusable
 * origin costs the reader nothing but the back link's destination, which then
 * falls to the scope's own list.
 */
export function parseFeedbackOrigin(raw: string | string[] | undefined): FeedbackOrigin | null {
  const value = firstOf(raw);
  if (value === undefined) return null;
  if (value === NOTES_TOKEN) return { kind: "notes", lowAnswerOnly: true };
  if (value === ALL_NOTES_TOKEN) return { kind: "notes", lowAnswerOnly: false };
  const dimension = DIMENSIONS.find((candidate) => DIMENSION_TOKENS[candidate] === value);
  if (dimension !== undefined) return { kind: "list", dimension };
  const separator = value.indexOf(":");
  const kind = SCOPE_KINDS.find((candidate) => candidate === value.slice(0, separator));
  const id = value.slice(separator + 1);
  if (separator < 0 || kind === undefined || !isFeedbackId(id)) return null;
  return { kind: "detail", scope: { kind, id } };
}

/** Whether the notes page shows only the notes that came with a low answer. */
export function parseFeedbackNotesFilter(raw: string | string[] | undefined): boolean {
  return firstOf(raw) !== ALL_NOTES;
}

function originToken(origin: FeedbackOrigin): string {
  switch (origin.kind) {
    case "list":
      return DIMENSION_TOKENS[origin.dimension];
    case "notes":
      return origin.lowAnswerOnly ? NOTES_TOKEN : ALL_NOTES_TOKEN;
    case "detail":
      return `${origin.scope.kind}:${origin.scope.id}`;
  }
}

/** The query a place carries: the range unless it is the default, and the place's own state. */
export function feedbackPlaceQuery(place: FeedbackPlace, range: FeedbackRange): Record<string, string> {
  const query: Record<string, string> =
    range === DEFAULT_FEEDBACK_RANGE ? {} : { [FEEDBACK_RANGE_PARAM]: range };
  if (place.view === "detail" && place.origin !== null) {
    query[FEEDBACK_ORIGIN_PARAM] = originToken(place.origin);
  }
  if (place.view === "notes" && !place.lowAnswerOnly) query[FEEDBACK_NOTES_PARAM] = ALL_NOTES;
  return query;
}

/** The place an origin is: where a detail page's back link leads. */
export function placeOfOrigin(origin: FeedbackOrigin): FeedbackPlace {
  switch (origin.kind) {
    case "list":
      return { view: "list", dimension: origin.dimension };
    case "notes":
      return { view: "notes", lowAnswerOnly: origin.lowAnswerOnly };
    case "detail":
      return { view: "detail", scope: origin.scope, origin: null };
  }
}

/** Where a detail page's back link leads with no origin: its own list, or the overview for a gamer. */
export function defaultBackPlace(scope: FeedbackScope): FeedbackPlace {
  return scope.kind === "gamer"
    ? { view: "overview" }
    : { view: "list", dimension: scope.kind };
}

/** The live admin routes. */
export const adminFeedbackHref: FeedbackHrefBuilder = (place, range) => {
  const query = feedbackPlaceQuery(place, range);
  switch (place.view) {
    case "overview":
      return { pathname: ROUTES.admin.feedback, query };
    case "list":
      return { pathname: ROUTES.admin.feedbackList(place.dimension), query };
    case "detail":
      return { ...ROUTES.admin.feedbackDetail(place.scope.kind, place.scope.id), query };
    case "notes":
      return { pathname: ROUTES.admin.feedbackNotes, query };
  }
};
