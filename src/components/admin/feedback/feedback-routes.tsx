import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { FeedbackDimension, FeedbackScopeKind } from "./aggregate-feedback";
import { FeedbackDetailPage } from "./feedback-detail-page";
import { FeedbackListPage } from "./feedback-list-page";
import { FeedbackOverviewPage } from "./feedback-overview-page";
import { FEEDBACK_ORIGIN_PARAM, isFeedbackId, parseFeedbackOrigin } from "./feedback-place";
import { FeedbackResponsesPage } from "./feedback-responses-page";
import { FeedbackLoadFailure } from "./feedback-shell";
import { loadFeedback } from "./load-feedback.server";

/**
 * **The feedback routes' one shape**: read the whole history, parse the
 * query, hand the client body the dataset and the selection to open on. Each
 * route file under `/admin/feedback` is a call into here, so the read, the
 * failure band and the parsing of the query are written once; every figure is
 * computed in the body, for whatever the admin selects.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function feedbackMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminFeedback") };
}

async function failure(reason: string | null) {
  const t = await getTranslations("admin.feedback");
  return <FeedbackLoadFailure title={t("title")} reason={reason} />;
}

export async function FeedbackOverviewRoute({ searchParams }: { searchParams: SearchParams }) {
  const load = await loadFeedback(await searchParams);
  if (!load.ok) return failure(load.reason);
  return <FeedbackOverviewPage read={load} />;
}

export async function FeedbackListRoute({
  dimension,
  searchParams,
}: {
  dimension: FeedbackDimension;
  searchParams: SearchParams;
}) {
  const load = await loadFeedback(await searchParams);
  if (!load.ok) return failure(load.reason);
  return <FeedbackListPage read={load} dimension={dimension} />;
}

/**
 * A malformed id is a 404: it can name nothing. A well-formed id the history
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
  const load = await loadFeedback(query);
  if (!load.ok) return failure(load.reason);
  return <FeedbackDetailPage read={load} scope={{ kind, id }} origin={origin} />;
}

export async function FeedbackResponsesRoute({ searchParams }: { searchParams: SearchParams }) {
  const load = await loadFeedback(await searchParams);
  if (!load.ok) return failure(load.reason);
  return <FeedbackResponsesPage read={load} />;
}
