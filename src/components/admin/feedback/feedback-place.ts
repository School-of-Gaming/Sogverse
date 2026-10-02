import type { ComponentProps } from "react";
import type { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import type { FeedbackListDimension, FeedbackScope, FeedbackScopeKind } from "./aggregate-feedback";

/** A link target the app's own typed `Link` accepts. */
export type FeedbackHref = ComponentProps<typeof Link>["href"];

/**
 * Where a detail page was opened from, so its back link returns there: a
 * list, what gamers said, or another detail (a product's group, a group's gamer).
 */
export type FeedbackOrigin =
  | { kind: "list"; dimension: FeedbackListDimension }
  | { kind: "responses" }
  | { kind: "detail"; scope: FeedbackScope };

/** **One page of the feedback section**, as data. Every link between the pages is built from a place. */
export type FeedbackPlace =
  | { view: "overview" }
  | { view: "list"; dimension: FeedbackListDimension }
  | { view: "detail"; scope: FeedbackScope; origin: FeedbackOrigin | null }
  | { view: "responses" };

/** The query parameter a detail page's origin travels in. */
export const FEEDBACK_ORIGIN_PARAM = "from";

/** The origin token of the platform's "What gamers said" page. */
const RESPONSES_TOKEN = "responses";

const DIMENSION_TOKENS = {
  product: "products",
  gedu: "gedus",
} as const satisfies Record<FeedbackListDimension, string>;

const DIMENSIONS: readonly FeedbackListDimension[] = ["product", "gedu"];
const SCOPE_KINDS: readonly FeedbackScopeKind[] = ["product", "group", "gedu", "gamer"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a route's id could name anything at all: every id here is a uuid. */
function isFeedbackId(id: string): boolean {
  return UUID.test(id);
}

/**
 * A route's id as the dataset spells it — lowercase, which is how every uuid
 * is read back from the database — or `null` when it could name nothing. A
 * uuid typed in capitals names the same thing, and must find it.
 */
export function feedbackScopeId(id: string): string | null {
  return isFeedbackId(id) ? id.toLowerCase() : null;
}

/**
 * The origin a `?from=` value names, or `null` for anything else — an unusable
 * origin costs the reader nothing but the back link's destination, which then
 * falls to the scope's own list.
 */
export function parseFeedbackOrigin(raw: string | string[] | undefined): FeedbackOrigin | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return null;
  if (value === RESPONSES_TOKEN) return { kind: "responses" };
  const dimension = DIMENSIONS.find((candidate) => DIMENSION_TOKENS[candidate] === value);
  if (dimension !== undefined) return { kind: "list", dimension };
  const separator = value.indexOf(":");
  const kind = SCOPE_KINDS.find((candidate) => candidate === value.slice(0, separator));
  const id = value.slice(separator + 1);
  if (separator < 0 || kind === undefined || !isFeedbackId(id)) return null;
  return { kind: "detail", scope: { kind, id } };
}

function originToken(origin: FeedbackOrigin): string {
  switch (origin.kind) {
    case "list":
      return DIMENSION_TOKENS[origin.dimension];
    case "responses":
      return RESPONSES_TOKEN;
    case "detail":
      return `${origin.scope.kind}:${origin.scope.id}`;
  }
}

/** The place an origin is: where a detail page's back link leads. */
export function placeOfOrigin(origin: FeedbackOrigin): FeedbackPlace {
  switch (origin.kind) {
    case "list":
      return { view: "list", dimension: origin.dimension };
    case "responses":
      return { view: "responses" };
    case "detail":
      return { view: "detail", scope: origin.scope, origin: null };
  }
}

/**
 * Where a detail page's back link leads with no origin: a product's or a
 * Gedu's list, a group's product (`productId`, when the group is known), or the
 * overview.
 */
export function defaultBackPlace(scope: FeedbackScope, productId: string | null): FeedbackPlace {
  switch (scope.kind) {
    case "product":
    case "gedu":
      return { view: "list", dimension: scope.kind };
    case "group":
      return productId === null
        ? { view: "overview" }
        : { view: "detail", scope: { kind: "product", id: productId }, origin: null };
    case "gamer":
      return { view: "overview" };
  }
}

/** A place's admin route; a detail page's carries its origin, for its back link. */
export function feedbackHref(place: FeedbackPlace): FeedbackHref {
  switch (place.view) {
    case "overview":
      return ROUTES.admin.feedback;
    case "list":
      return ROUTES.admin.feedbackList(place.dimension);
    case "detail":
      return feedbackDetailHref(place.scope, place.origin);
    case "responses":
      return ROUTES.admin.feedbackResponses;
  }
}

/** A detail page's route carrying its origin — typed narrowly enough for a server redirect. */
export function feedbackDetailHref(scope: FeedbackScope, origin: FeedbackOrigin | null) {
  const route = ROUTES.admin.feedbackDetail(scope.kind, scope.id);
  return origin === null
    ? route
    : { ...route, query: { [FEEDBACK_ORIGIN_PARAM]: originToken(origin) } };
}
