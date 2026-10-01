import {
  SESSION_FEEDBACK_ITEMS,
  SESSION_FEEDBACK_THEMES,
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

/** The themes a source's statements report into, in the owner's order. */
export function themesOf(source: FeedbackSource): SessionFeedbackTheme[] {
  const asked = new Set(FEEDBACK_CATALOGUES[source].map((item) => item.theme));
  return SESSION_FEEDBACK_THEMES.filter((theme) => asked.has(theme));
}

/**
 * The message key each theme is named by. The catalogue's theme strings are
 * internal identifiers — the owner's words, kept for the code — so the page
 * reads its labels from here rather than printing them.
 */
export const FEEDBACK_THEME_MESSAGE_KEYS = {
  Learning: "learning",
  Fun: "fun",
  "Gedu quality": "geduQuality",
  Belonging: "belonging",
} as const satisfies Record<SessionFeedbackTheme, string>;

/** The message key naming who answers a source, and when. */
export const FEEDBACK_SOURCE_MESSAGE_KEYS = {
  gamer_online: "gamerOnline",
} as const satisfies Record<FeedbackSource, string>;
