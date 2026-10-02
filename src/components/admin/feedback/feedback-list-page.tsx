"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import {
  buildFeedbackDimensionList,
  type FeedbackListDimension,
  type FeedbackRead,
} from "./aggregate-feedback";
import { FeedbackDimensionRows } from "./feedback-dimension-rows";
import { FeedbackShell } from "./feedback-shell";

/**
 * **One dimension's list — products or Gedus — worst first**: the
 * page an admin dives into from the overview, and the way into each row's own
 * page.
 */
export function FeedbackListPage({
  read,
  dimension,
}: {
  read: FeedbackRead;
  dimension: FeedbackListDimension;
}) {
  const t = useTranslations("admin.feedback.lists");
  const { dataset, source } = read;
  const list = useMemo(
    () => buildFeedbackDimensionList(dataset, source, dimension),
    [dataset, source, dimension],
  );

  return (
    <FeedbackShell
      title={t(`titles.${dimension}`)}
      subtitle={t("subtitle")}
      back={{ view: "overview" }}
    >
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
