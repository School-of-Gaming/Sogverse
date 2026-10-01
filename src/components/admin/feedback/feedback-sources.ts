import {
  SESSION_FEEDBACK_ITEMS,
  type SessionFeedbackTheme,
} from "@/components/voice/feedback/session-feedback-items";
import type { FeedbackSource } from "@/services/session-feedback/admin-feedback.contracts";

/**
 * What the feedback page needs to know about one statement of a source's
 * instrument: the key its answer is stored under, and the theme it reports into.
 */
export interface FeedbackStatement {
  key: string;
  theme: SessionFeedbackTheme;
}

/**
 * Each source's statements, in the order that source asks them.
 *
 * Keyed on the source because one question asked two ways is two instruments:
 * a parent's "my child had fun" is not the same measurement as a gamer's "I had
 * fun", even if both report into Fun. A future source joins here with its own
 * catalogue, and every figure on the page is computed against the catalogue of
 * the source it belongs to — a stored key that no longer appears in it is
 * ignored rather than counted.
 */
export const FEEDBACK_CATALOGUES: Record<
  FeedbackSource,
  readonly FeedbackStatement[]
> = {
  gamer_online: SESSION_FEEDBACK_ITEMS,
};

/** The message key naming who answers a source, and when. */
export const FEEDBACK_SOURCE_MESSAGE_KEYS = {
  gamer_online: "gamerOnline",
} as const satisfies Record<FeedbackSource, string>;
