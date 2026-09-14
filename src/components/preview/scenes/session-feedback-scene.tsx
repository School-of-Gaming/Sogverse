"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SessionFeedbackScreen } from "@/components/voice/feedback/SessionFeedbackScreen";
import { useSessionFeedbackItems } from "@/components/voice/feedback/use-session-feedback-items";
import type { SessionFeedbackSceneScenario } from "./session-feedback-scenarios";

/**
 * The screen a gamer meets on the way out of an online session, in the chrome
 * they meet it in.
 *
 * It is here rather than on the style guide because the open question about it
 * is how it reads as a page: the column is longer than a phone viewport and is
 * meant to be, so what has to be judged is the width the page gives it, the
 * rhythm of scrolling five statements under the app's own header, and how the
 * uncarded phone layout sits against the carded one above `sm` — none of which
 * a card lifted out of the page can answer.
 *
 * Two scenarios, because the two live paths do not render the same screen: the
 * room closing at the window's end announces that above the heading and the
 * Leave path says nothing. Done is inert and holds its committed state, which
 * is what the live paths show for the moment before the document unloads.
 */
export function SessionFeedbackScene({
  scenario,
}: {
  scenario: SessionFeedbackSceneScenario;
}) {
  const t = useTranslations("voice");
  const items = useSessionFeedbackItems();
  const [finished, setFinished] = useState(false);

  return (
    <SessionFeedbackScreen
      items={items}
      committing={finished}
      onDone={() => setFinished(true)}
      lead={scenario === "session-ended" ? t("sessionEnded") : undefined}
    />
  );
}
