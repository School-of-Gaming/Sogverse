"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  AdminFeedbackLoadFailure,
  AdminFeedbackPage,
  type FeedbackHref,
} from "@/components/admin/feedback/admin-feedback-page";
import {
  NO_FEEDBACK_FILTERS,
  feedbackFilterQuery,
  type FeedbackFilters,
} from "@/components/admin/feedback/feedback-filters";
import {
  DEFAULT_FEEDBACK_RANGE,
  FEEDBACK_RANGE_PARAM,
  resolveFeedbackRange,
  type FeedbackRange,
} from "@/components/admin/feedback/feedback-range";
import {
  feedbackFixture,
  type AdminFeedbackPreviewScenario,
} from "@/components/admin/feedback/mock-feedback-fixtures";
import { previewSceneHref } from "@/components/preview/href";

/**
 * **Feedback, the admin's read** — the live page body over a generated year.
 *
 * What the scene replaces is what the route supplies: the dataset, read here
 * from the fixture year narrowed to the range, and where the range control
 * points, which is back at this scene so a reviewer can try all three. The
 * drill-downs, the tabs, the sort and the notes toggle are the page's own and
 * work as they do live; a row's link out lands on a not-found page, because a
 * fixture id names nothing in the database.
 */
export function AdminFeedbackScene({
  scenario,
}: {
  scenario: AdminFeedbackPreviewScenario;
}) {
  const range = resolveFeedbackRange(
    useSearchParams().get(FEEDBACK_RANGE_PARAM) ?? undefined,
  );
  const dataset = useMemo(
    () => (scenario === "load-failed" ? null : feedbackFixture(scenario, range)),
    [scenario, range],
  );

  if (dataset === null) return <AdminFeedbackLoadFailure reason={null} />;

  return (
    <AdminFeedbackPage
      range={range}
      dataset={dataset}
      initialFilters={NO_FEEDBACK_FILTERS}
      rangeHref={(next, filters) => previewRangeHref(scenario, next, filters)}
    />
  );
}

function previewRangeHref(
  scenario: AdminFeedbackPreviewScenario,
  range: FeedbackRange,
  filters: FeedbackFilters,
): FeedbackHref {
  const href = previewSceneHref("admin-feedback", scenario);
  return {
    ...href,
    query: {
      ...(range === DEFAULT_FEEDBACK_RANGE ? {} : { [FEEDBACK_RANGE_PARAM]: range }),
      ...feedbackFilterQuery(filters),
    },
  };
}
