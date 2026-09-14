"use client";

import { useState } from "react";
import { SessionFeedbackScreen } from "@/components/voice/feedback/SessionFeedbackScreen";
import { useSessionFeedbackItems } from "@/components/voice/feedback/use-session-feedback-items";

/**
 * The screen a gamer meets on the way out of an online session, in the chrome
 * they meet it in.
 *
 * It is here rather than on the style guide because the only open question
 * about it is whether it fits: seven statements, a five-point row each, a note
 * and a Done have to sit inside one phone viewport under the app's own header,
 * and a card lifted out of the page cannot answer that.
 *
 * One scenario, because the two live paths — Leave, and the room closing at the
 * window's end — render the same screen. Done is inert and holds its committed
 * state, which is what the live paths show for the moment before the document
 * unloads.
 */
export function SessionFeedbackScene() {
  const items = useSessionFeedbackItems();
  const [finished, setFinished] = useState(false);

  return (
    <SessionFeedbackScreen
      items={items}
      committing={finished}
      onDone={() => setFinished(true)}
    />
  );
}

/** The scene's one scenario, narrowed where the renderer resolves a slug. */
export const SESSION_FEEDBACK_SCENARIOS = ["default"] as const;

export type SessionFeedbackSceneScenario =
  (typeof SESSION_FEEDBACK_SCENARIOS)[number];

export function isSessionFeedbackScenario(
  value: string,
): value is SessionFeedbackSceneScenario {
  return SESSION_FEEDBACK_SCENARIOS.some((scenario) => scenario === value);
}
