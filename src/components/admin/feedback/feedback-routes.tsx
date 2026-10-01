import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  buildFeedbackDetail,
  buildFeedbackDimensionList,
  buildFeedbackOverview,
  buildFeedbackResponses,
  type FeedbackDimension,
  type FeedbackScopeKind,
} from "./aggregate-feedback";
import { FeedbackDetailPage } from "./feedback-detail-page";
import { FeedbackListPage } from "./feedback-list-page";
import { FeedbackOverviewPage } from "./feedback-overview-page";
import {
  FEEDBACK_ORIGIN_PARAM,
  isFeedbackId,
  parseFeedbackOrigin,
  type FeedbackPlace,
} from "./feedback-place";
import type { FeedbackRange } from "./feedback-range";
import { FeedbackResponsesPage } from "./feedback-responses-page";
import { FeedbackLoadFailure } from "./feedback-shell";
import { loadFeedback } from "./load-feedback.server";

/**
 * **The feedback routes' one shape**: read the range, build the view the page
 * needs on the server, hand the presentational body its model. Each route
 * file under `/admin/feedback` is a call into here, so the read, the failure
 * band and the parsing of the query are written once.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function feedbackMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminFeedback") };
}

async function failure(place: FeedbackPlace, range: FeedbackRange, reason: string | null) {
  const t = await getTranslations("admin.feedback");
  return <FeedbackLoadFailure range={range} place={place} title={t("title")} reason={reason} />;
}

export async function FeedbackOverviewRoute({ searchParams }: { searchParams: SearchParams }) {
  const load = await loadFeedback(await searchParams);
  if (!load.ok) return failure({ view: "overview" }, load.range, load.reason);
  return (
    <FeedbackOverviewPage
      range={load.range}
      overview={buildFeedbackOverview(load.dataset, load.source, load.periods)}
    />
  );
}

export async function FeedbackListRoute({
  dimension,
  searchParams,
}: {
  dimension: FeedbackDimension;
  searchParams: SearchParams;
}) {
  const load = await loadFeedback(await searchParams);
  if (!load.ok) return failure({ view: "list", dimension }, load.range, load.reason);
  return (
    <FeedbackListPage
      range={load.range}
      list={buildFeedbackDimensionList(load.dataset, load.source, load.periods, dimension)}
    />
  );
}

/**
 * A malformed id is a 404: it can name nothing. A well-formed id the range
 * has no feedback for renders the page saying so, because the thing may well
 * exist and simply have had a quiet month.
 */
export async function FeedbackDetailRoute({
  kind,
  params,
  searchParams,
}: {
  kind: FeedbackScopeKind;
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  if (!isFeedbackId(id)) notFound();
  const query = await searchParams;
  const origin = parseFeedbackOrigin(query[FEEDBACK_ORIGIN_PARAM]);
  const scope = { kind, id };
  const load = await loadFeedback(query);
  if (!load.ok) return failure({ view: "detail", scope, origin }, load.range, load.reason);
  return (
    <FeedbackDetailPage
      range={load.range}
      detail={buildFeedbackDetail(load.dataset, load.source, load.periods, scope)}
      origin={origin}
    />
  );
}

export async function FeedbackResponsesRoute({ searchParams }: { searchParams: SearchParams }) {
  const load = await loadFeedback(await searchParams);
  if (!load.ok) return failure({ view: "responses" }, load.range, load.reason);
  return (
    <FeedbackResponsesPage
      range={load.range}
      view={buildFeedbackResponses(load.dataset, load.source, load.periods)}
    />
  );
}
