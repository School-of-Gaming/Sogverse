"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import {
  buildFeedbackDimensionList,
  buildFeedbackTimeline,
  type FeedbackDimension,
  type FeedbackRead,
} from "./aggregate-feedback";
import { FeedbackDimensionRows } from "./feedback-dimension-rows";
import { FeedbackShell } from "./feedback-shell";
import { FeedbackTimeline } from "./feedback-timeline";

/**
 * **One dimension's list — products, groups or Gedus — worst first**: the
 * page an admin dives into from the overview, and the way into each row's own
 * page, under the platform's timeline.
 */
export function FeedbackListPage({
  read,
  dimension,
}: {
  read: FeedbackRead;
  dimension: FeedbackDimension;
}) {
  const t = useTranslations("admin.feedback.lists");
  const { dataset, source, history } = read;
  const list = useMemo(
    () => buildFeedbackDimensionList(dataset, source, dimension),
    [dataset, source, dimension],
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
