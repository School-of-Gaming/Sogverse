import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import {
  feedbackCanonicalScope,
  type FeedbackListDimension,
  type FeedbackScopeKind,
} from "./aggregate-feedback";
import { FeedbackDetailPage } from "./feedback-detail-page";
import { FeedbackListPage } from "./feedback-list-page";
import { FeedbackOverviewPage } from "./feedback-overview-page";
import {
  FEEDBACK_ORIGIN_PARAM,
  feedbackDetailHref,
  feedbackScopeId,
  parseFeedbackOrigin,
} from "./feedback-place";
import { FeedbackResponsesPage } from "./feedback-responses-page";
import { FeedbackLoadFailure } from "./feedback-shell";
import { loadFeedback } from "./load-feedback.server";

/**
 * **The feedback routes' one shape**: read the whole history and hand the
 * client body the dataset. Each route file under `/admin/feedback` is a call
 * into here, so the read and the failure band are written once; every figure
 * is computed in the body.
 */

export async function feedbackMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminFeedback") };
}

async function failure(reason: string | null) {
  const t = await getTranslations("admin.feedback");
  return <FeedbackLoadFailure title={t("title")} reason={reason} />;
}

export async function FeedbackOverviewRoute() {
  const load = await loadFeedback();
  if (!load.ok) return failure(load.reason);
  return <FeedbackOverviewPage read={load} />;
}

export async function FeedbackListRoute({ dimension }: { dimension: FeedbackListDimension }) {
  const load = await loadFeedback();
  if (!load.ok) return failure(load.reason);
  return <FeedbackListPage read={load} dimension={dimension} />;
}

/**
 * A malformed id is a 404: it can name nothing. A well-formed id the history
 * has no feedback for renders the page saying so, because the thing may well
 * exist and simply not have been answered about yet.
 *
 * A group of a single-group product is read on its product's page, so its own
 * address redirects there, keeping the origin: one thing never has two pages
 * that look alike and list different things.
 */
export async function FeedbackDetailRoute({
  kind,
  params,
  searchParams,
}: {
  kind: FeedbackScopeKind;
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const id = feedbackScopeId((await params).id);
  if (id === null) notFound();
  const origin = parseFeedbackOrigin((await searchParams)[FEEDBACK_ORIGIN_PARAM]);
  const load = await loadFeedback();
  if (!load.ok) return failure(load.reason);
  const scope = feedbackCanonicalScope(load.dataset, load.source, { kind, id });
  if (scope.kind !== kind) {
    redirect({ href: feedbackDetailHref(scope, origin), locale: await getLocale() });
  }
  return <FeedbackDetailPage read={load} scope={scope} origin={origin} />;
}

export async function FeedbackResponsesRoute() {
  const load = await loadFeedback();
  if (!load.ok) return failure(load.reason);
  return <FeedbackResponsesPage read={load} />;
}
