"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import {
  buildFeedbackDimensionList,
  buildFeedbackTimeline,
  type FeedbackDimension,
} from "./aggregate-feedback";
import { FeedbackDimensionRows } from "./feedback-dimension-rows";
import { FeedbackSelectionProvider, useFeedbackPeriods, type FeedbackRead } from "./feedback-nav";
import { FeedbackShell } from "./feedback-shell";
import { FeedbackTimeline } from "./feedback-timeline";

/**
 * **One dimension's list — products, groups or Gedus — worst first**: the
 * page an admin dives into from the overview, and the way into each row's own
 * page. The platform's timeline sits above it, so the period can be moved
 * here as on every other feedback page.
 */
export function FeedbackListPage({
  read,
  dimension,
}: {
  read: FeedbackRead;
  dimension: FeedbackDimension;
}) {
  return (
    <FeedbackSelectionProvider history={read.history} initial={read.selection}>
      <ListBody read={read} dimension={dimension} />
    </FeedbackSelectionProvider>
  );
}

function ListBody({ read, dimension }: { read: FeedbackRead; dimension: FeedbackDimension }) {
  const t = useTranslations("admin.feedback.lists");
  const { dataset, source, history } = read;
  const periods = useFeedbackPeriods();
  const list = useMemo(
    () => buildFeedbackDimensionList(dataset, source, periods, dimension),
    [dataset, source, periods, dimension],
  );
  const timeline = useMemo(
    () => buildFeedbackTimeline(dataset, source, history, null),
    [dataset, source, history],
  );

  return (
    <FeedbackShell
      title={t(`titles.${dimension}`)}
      subtitle={t("subtitle")}
      back={{ view: "overview" }}
    >
      <Card className="p-5">
        <FeedbackTimeline timeline={timeline} />
      </Card>
      <Card className="overflow-hidden">
        <FeedbackDimensionRows
          source={list.source}
          rows={list.rows}
          platform={list.platform}
          origin={{ kind: "list", dimension }}
        />
      </Card>
    </FeedbackShell>
  );
}
