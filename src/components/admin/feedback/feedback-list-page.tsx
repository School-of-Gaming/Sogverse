"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import type { FeedbackDimensionList } from "./aggregate-feedback";
import { FeedbackDimensionRows } from "./feedback-dimension-rows";
import type { FeedbackRange } from "./feedback-range";
import { FeedbackShell } from "./feedback-shell";

/**
 * **One dimension's list — products, groups or Gedus — worst first**: the
 * page an admin dives into from the overview, and the way into each row's own
 * page.
 */
export function FeedbackListPage({
  range,
  list,
}: {
  range: FeedbackRange;
  list: FeedbackDimensionList;
}) {
  const t = useTranslations("admin.feedback.lists");

  return (
    <FeedbackShell
      range={range}
      place={{ view: "list", dimension: list.dimension }}
      title={t(`titles.${list.dimension}`)}
      subtitle={t("subtitle")}
      back={{ view: "overview" }}
    >
      <Card className="overflow-hidden">
        <FeedbackDimensionRows
          source={list.source}
          rows={list.rows}
          platform={list.platform}
          origin={{ kind: "list", dimension: list.dimension }}
        />
      </Card>
    </FeedbackShell>
  );
}
