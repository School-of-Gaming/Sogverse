"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { buildFeedbackResponses, buildFeedbackTimeline } from "./aggregate-feedback";
import { FeedbackSelectionProvider, useFeedbackPeriods, type FeedbackRead } from "./feedback-nav";
import { WhatGamersSaid } from "./feedback-responses";
import { FeedbackShell } from "./feedback-shell";
import { FeedbackTimeline } from "./feedback-timeline";

/**
 * **What gamers said across the whole platform** — the list every detail page
 * carries, unnarrowed: worth reading first, every response a switch away,
 * under the platform's timeline the period is picked on.
 */
export function FeedbackResponsesPage({ read }: { read: FeedbackRead }) {
  return (
    <FeedbackSelectionProvider history={read.history} initial={read.selection}>
      <ResponsesBody read={read} />
    </FeedbackSelectionProvider>
  );
}

function ResponsesBody({ read }: { read: FeedbackRead }) {
  const t = useTranslations("admin.feedback");
  const { dataset, source, history } = read;
  const periods = useFeedbackPeriods();
  const view = useMemo(
    () => buildFeedbackResponses(dataset, source, periods),
    [dataset, source, periods],
  );
  const timeline = useMemo(
    () => buildFeedbackTimeline(dataset, source, history, null),
    [dataset, source, history],
  );

  return (
    <FeedbackShell title={t("responses.title")} back={{ view: "overview" }}>
      <Card className="p-5">
        <FeedbackTimeline timeline={timeline} />
      </Card>
      {view.responses.all.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <WhatGamersSaid responses={view.responses} origin={{ kind: "responses" }} />
      )}
    </FeedbackShell>
  );
}
