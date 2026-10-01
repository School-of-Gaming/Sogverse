"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  buildFeedbackDetail,
  buildFeedbackDimensionList,
  buildFeedbackNotes,
  buildFeedbackOverview,
  type FeedbackDimension,
} from "@/components/admin/feedback/aggregate-feedback";
import { FeedbackDetailPage } from "@/components/admin/feedback/feedback-detail-page";
import { FeedbackListPage } from "@/components/admin/feedback/feedback-list-page";
import { FeedbackHrefProvider } from "@/components/admin/feedback/feedback-nav";
import { FeedbackNotesPage } from "@/components/admin/feedback/feedback-notes-page";
import { FeedbackOverviewPage } from "@/components/admin/feedback/feedback-overview-page";
import {
  FEEDBACK_NOTES_PARAM,
  FEEDBACK_ORIGIN_PARAM,
  feedbackPlaceQuery,
  parseFeedbackNotesFilter,
  parseFeedbackOrigin,
  type FeedbackHrefBuilder,
} from "@/components/admin/feedback/feedback-place";
import {
  FEEDBACK_RANGE_PARAM,
  feedbackRangePeriods,
  feedbackReadSpan,
  resolveFeedbackRange,
} from "@/components/admin/feedback/feedback-range";
import { FeedbackLoadFailure } from "@/components/admin/feedback/feedback-shell";
import {
  FEEDBACK_FIXTURE_FEATURED,
  FEEDBACK_FIXTURE_LIST,
  FEEDBACK_FIXTURE_TODAY,
  feedbackFixture,
  type AdminFeedbackPreviewScenario,
} from "@/components/admin/feedback/mock-feedback-fixtures";
import { previewSceneHref } from "@/components/preview/href";
import { FEEDBACK_SOURCES } from "@/services/session-feedback/admin-feedback.contracts";

const SURFACE = "admin-feedback";
const DIMENSION_PARAM = "dimension";
const ID_PARAM = "id";
const DIMENSIONS: readonly FeedbackDimension[] = ["product", "group", "gedu"];

/**
 * **Feedback, the admin's read** — the live page bodies over two generated
 * years.
 *
 * What the scene replaces is what the routes supply: the dataset, cut from the
 * fixture to the span a page reads, and where every link points. Links between
 * the feedback pages stay inside the scene — a list row opens the matching
 * detail scenario with the row's `?id=` — so the whole section can be walked
 * through from the overview. The links out to the normal admin pages land on a
 * not-found page, because a fixture id names nothing in the database.
 */
export function AdminFeedbackScene({ scenario }: { scenario: AdminFeedbackPreviewScenario }) {
  const params = useSearchParams();
  const range = resolveFeedbackRange(params.get(FEEDBACK_RANGE_PARAM) ?? undefined);
  const t = useTranslations("admin.feedback");
  const periods = useMemo(() => feedbackRangePeriods(range, FEEDBACK_FIXTURE_TODAY), [range]);
  const dataset = useMemo(
    () => feedbackFixture(feedbackReadSpan(periods), scenario === "empty"),
    [periods, scenario],
  );
  const build = useMemo(() => previewHref(scenario), [scenario]);
  const source = FEEDBACK_SOURCES[0];

  const page = (() => {
    switch (scenario) {
      case "load-failed":
        return <FeedbackLoadFailure range={range} place={{ view: "overview" }} title={t("title")} reason={null} />;
      case "overview":
      case "empty":
        return <FeedbackOverviewPage range={range} overview={buildFeedbackOverview(dataset, source, periods)} />;
      case "list": {
        const raw = params.get(DIMENSION_PARAM);
        const dimension = DIMENSIONS.find((candidate) => candidate === raw) ?? FEEDBACK_FIXTURE_LIST;
        return (
          <FeedbackListPage
            range={range}
            list={buildFeedbackDimensionList(dataset, source, periods, dimension)}
          />
        );
      }
      case "notes": {
        const lowAnswerOnly = parseFeedbackNotesFilter(params.get(FEEDBACK_NOTES_PARAM) ?? undefined);
        return (
          <FeedbackNotesPage
            range={range}
            lowAnswerOnly={lowAnswerOnly}
            view={buildFeedbackNotes(dataset, source, periods, { lowAnswerOnly })}
          />
        );
      }
      case "product":
      case "group":
      case "gedu":
      case "gamer": {
        const scope = { kind: scenario, id: params.get(ID_PARAM) ?? FEEDBACK_FIXTURE_FEATURED[scenario] };
        return (
          <FeedbackDetailPage
            range={range}
            detail={buildFeedbackDetail(dataset, source, periods, scope)}
            origin={parseFeedbackOrigin(params.get(FEEDBACK_ORIGIN_PARAM) ?? undefined)}
          />
        );
      }
    }
  })();

  return <FeedbackHrefProvider build={build}>{page}</FeedbackHrefProvider>;
}

/**
 * Every place, as the scenario that draws it. The empty and failed scenarios
 * keep every link on themselves: their range control is the only way out, and
 * it should show the same state at another range.
 */
function previewHref(scenario: AdminFeedbackPreviewScenario): FeedbackHrefBuilder {
  return (place, range) => {
    const query = feedbackPlaceQuery(place, range);
    const at = (slug: AdminFeedbackPreviewScenario, extra: Record<string, string> = {}) => ({
      ...previewSceneHref(SURFACE, slug),
      query: { ...query, ...extra },
    });
    if (scenario === "empty" || scenario === "load-failed") return at(scenario);
    switch (place.view) {
      case "overview":
        return at("overview");
      case "list":
        return at("list", { [DIMENSION_PARAM]: place.dimension });
      case "detail":
        return at(place.scope.kind, { [ID_PARAM]: place.scope.id });
      case "notes":
        return at("notes");
    }
  };
}
