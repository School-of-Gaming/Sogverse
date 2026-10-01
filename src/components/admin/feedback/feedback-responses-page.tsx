"use client";

import { useTranslations } from "next-intl";
import type { FeedbackResponsesView } from "./aggregate-feedback";
import type { FeedbackRange } from "./feedback-range";
import { WhatGamersSaid } from "./feedback-responses";
import { FeedbackShell } from "./feedback-shell";

/**
 * **What gamers said across the whole platform** — the list every detail page
 * carries, unnarrowed: worth reading first, every response a switch away.
 */
export function FeedbackResponsesPage({
  range,
  view,
}: {
  range: FeedbackRange;
  view: FeedbackResponsesView;
}) {
  const t = useTranslations("admin.feedback");

  return (
    <FeedbackShell
      range={range}
      place={{ view: "responses" }}
      title={t("responses.title")}
      back={{ view: "overview" }}
    >
      {view.responses.all.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <WhatGamersSaid responses={view.responses} origin={{ kind: "responses" }} />
      )}
    </FeedbackShell>
  );
}
