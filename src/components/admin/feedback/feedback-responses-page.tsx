"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { buildFeedbackResponses, type FeedbackRead } from "./aggregate-feedback";
import { WhatGamersSaid } from "./feedback-responses";
import { FeedbackShell } from "./feedback-shell";

/**
 * **What gamers said across the whole platform** — the list every detail page
 * carries, unnarrowed: worth reading first, every response a switch away.
 */
export function FeedbackResponsesPage({ read }: { read: FeedbackRead }) {
  const t = useTranslations("admin.feedback");
  const { dataset, source } = read;
  const view = useMemo(() => buildFeedbackResponses(dataset, source), [dataset, source]);

  return (
    <FeedbackShell title={t("responses.title")} back={{ view: "overview" }}>
      {view.responses.all.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <WhatGamersSaid source={view.source} responses={view.responses} origin={{ kind: "responses" }} />
      )}
    </FeedbackShell>
  );
}
