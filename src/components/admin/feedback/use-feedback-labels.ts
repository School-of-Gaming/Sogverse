"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  SESSION_FEEDBACK_ITEMS,
  SESSION_FEEDBACK_RATING_KEYS,
  type SessionFeedbackRating,
} from "@/components/voice/feedback/session-feedback-items";
import { useSessionFeedbackItems } from "@/components/voice/feedback/use-session-feedback-items";
import type { FeedbackSource } from "@/services/session-feedback/admin-feedback.contracts";

/**
 * Each statement's wording, keyed by its stored key, in the words the source's
 * respondents read — the page quotes the question as it was asked.
 */
export function useFeedbackStatementLabels(
  source: FeedbackSource,
): Record<string, string> {
  const gamerItems = useSessionFeedbackItems();
  return useMemo(() => {
    const items = { gamer_online: gamerItems }[source];
    return Object.fromEntries(items.map(({ key, label }) => [key, label]));
  }, [gamerItems, source]);
}

/**
 * Each statement's short admin name — "Learned", "Gedu kind" — keyed by its
 * stored key: a column heading for a reader who already knows the five, with
 * the sentence itself a hover or a focus away. Never shown to a respondent.
 */
export function useFeedbackStatementShortLabels(
  source: FeedbackSource,
): Record<string, string> {
  const t = useTranslations("admin.feedback.statementLabels");
  return useMemo(() => {
    const keys = { gamer_online: SESSION_FEEDBACK_ITEMS.map(({ key }) => key) }[source];
    return Object.fromEntries(keys.map((key) => [key, t(key)]));
  }, [t, source]);
}

/**
 * A level's word, the same word the respondent tapped. A number is never shown
 * for a level: "4" is the storage, "Yes" is the answer.
 */
export function useRatingWord(): (rating: SessionFeedbackRating) => string {
  const t = useTranslations("voice.feedback.scale");
  return useCallback((rating) => t(SESSION_FEEDBACK_RATING_KEYS[rating]), [t]);
}
