"use client";

import { useState } from "react";
import {
  HelpFeedbackCardView,
  type HelpFeedbackAudience,
} from "@/components/help/help-feedback-card-view";

/**
 * The real help/feedback form with its submit reaching nothing — what all three
 * dashboard scenes render in place of the live card.
 *
 * **This is the reason the form arrives at a page body as a node.** A scene
 * mocks the whole page as the role meets it, so the section has to be *there*,
 * looking like itself, with the textarea, the character counters and the
 * disabled-until-long-enough button all working — those are pure UI over local
 * state. What must not happen is a POST, because that one writes a row and
 * mails every admin on the platform.
 *
 * Typing is live for the same reason the other scenes' inert panels keep their
 * local behaviour: a form nobody can type into stops reading as the real one.
 * The states a submit produces — in flight, thanked, refused — are not
 * reachable from here and have their own side-by-side section in the style
 * guide, which is where states are compared.
 */
export function InertHelpFeedbackCard({
  audience,
}: {
  audience: HelpFeedbackAudience;
}) {
  const [message, setMessage] = useState("");

  return (
    <HelpFeedbackCardView
      audience={audience}
      message={message}
      onMessageChange={setMessage}
      submitting={false}
      succeeded={false}
      error={null}
      onSubmit={noop}
    />
  );
}

function noop() {}
