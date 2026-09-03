"use client";

import { useState } from "react";
import {
  HELP_MESSAGE_MAX_LENGTH,
  HELP_MESSAGE_MIN_LENGTH,
  HelpFeedbackCardView,
  type HelpFeedbackAudience,
  type HelpFeedbackFailure,
} from "./help-feedback-card-view";

/**
 * Data half of the help/feedback form: one POST, and nothing else. The markup
 * lives in the view beside it, which takes the whole card state as props.
 *
 * **A `fetch` rather than a service or a React Query mutation, deliberately.**
 * There is no service layer behind this: the route calls the rate-limited RPC
 * directly, writes one row and mails every admin, and nothing on any page reads
 * the submissions back — so there is no cache to invalidate and nothing for a
 * query key to name.
 *
 * The route answers a 429 once the database's rolling-hour limit is reached.
 * That is a real answer rather than a fault, and it is the one failure the
 * reader can do something specific about (wait), so it is carried to the view
 * as its own code and worded there in the reader's language.
 *
 * A submit that lands clears the textarea, which is why the message is held
 * here rather than inside the view: the view has to be drivable from a preview
 * scene's own state with the submit inert.
 */
export function HelpFeedbackCard({
  audience,
}: {
  /** Which register the copy is written in — see the view's own note. */
  audience: HelpFeedbackAudience;
}) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<HelpFeedbackFailure | null>(null);

  async function handleSubmit() {
    // The button is disabled outside the range; this is the guard that keeps a
    // stray programmatic call from posting a body the route's schema rejects.
    if (
      message.length < HELP_MESSAGE_MIN_LENGTH ||
      message.length > HELP_MESSAGE_MAX_LENGTH
    )
      return;

    setSubmitting(true);
    setSucceeded(false);
    setError(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        setError(response.status === 429 ? "rateLimited" : "failed");
        return;
      }

      setSucceeded(true);
      setMessage("");
    } catch {
      setError("failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <HelpFeedbackCardView
      audience={audience}
      message={message}
      onMessageChange={setMessage}
      submitting={submitting}
      succeeded={succeeded}
      error={error}
      onSubmit={() => void handleSubmit()}
    />
  );
}
