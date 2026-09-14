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
 * It is here rather than on the style guide because the only open question
 * about it is whether it fits: seven statements, a five-point row each, a note
 * and a Done have to sit inside one phone viewport under the app's own header,
 * and a card lifted out of the page cannot answer that.
 *
 * Two scenarios, because the two live paths do not render the same screen: the
 * room closing at the window's end announces that above the heading and the
 * Leave path says nothing, so the ended one is a line taller and is the one the
 * budget is judged against. Done is inert and holds its committed state, which
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
