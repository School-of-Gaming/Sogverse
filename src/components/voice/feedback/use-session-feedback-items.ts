"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SESSION_FEEDBACK_ITEMS } from "./session-feedback-items";
import type { SessionFeedbackItem } from "./SessionFeedbackScreen";

/**
 * The seven statements with their words in the reader's locale.
 *
 * The screen takes its statements as data so it can be rendered from fixtures
 * with no catalogue behind it; every live caller wants the same seven in the
 * same order, so the pairing of the catalogue with the definitions is done once
 * here rather than at each call site.
 */
export function useSessionFeedbackItems(): readonly SessionFeedbackItem[] {
  const t = useTranslations("voice.feedback.items");
  return useMemo(
    () =>
      SESSION_FEEDBACK_ITEMS.map(({ key }) => ({ key, label: t(key) })),
    [t],
  );
}
