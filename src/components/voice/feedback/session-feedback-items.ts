import type { YtyElementId } from "@/lib/constants/yty";

/**
 * The five-point answer row, in the order it is drawn.
 *
 * The numbers are the stored shape and the words are what a gamer reads: a bare
 * number on a tap target asks a child to decode a scale before answering, so the
 * row never draws one. The tuple is the single source of both the order and the
 * values, so a row cannot be re-ordered without re-ordering the values with it.
 */
export const SESSION_FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const;

export type SessionFeedbackRating = (typeof SESSION_FEEDBACK_RATINGS)[number];

/**
 * The message key each point on the row takes its word from, indexed by the
 * value it stands for.
 */
export const SESSION_FEEDBACK_RATING_KEYS = {
  1: "no",
  2: "notReally",
  3: "aBit",
  4: "yes",
  5: "definitely",
} as const satisfies Record<SessionFeedbackRating, string>;

export interface SessionFeedbackItemDefinition {
  /**
   * The stable identifier the answer is stored under, and the message key the
   * statement is read from. Never the English sentence: the wording is copy and
   * will be re-written, and a stored answer has to survive that.
   */
  key: string;
  /**
   * The Yty-Element this statement reports into once there is an instrument
   * behind the screen — harmony is the relationship with yourself, glow with
   * others, valor with society, wit with technology.
   *
   * **Internal, and never surfaced to the gamer.** The screen draws no element
   * mark, name or colour: a child answering "I had fun" is answering that
   * sentence, and being told which bucket it feeds would teach them to answer
   * the bucket instead.
   */
  element: YtyElementId;
}

/**
 * The seven statements a gamer is asked after an online session, in the order
 * they are asked.
 *
 * One place, because three things have to agree about them — the screen, the
 * message catalogue and whatever eventually stores an answer — and the order is
 * part of the question: the same statements read in a different order are a
 * different questionnaire.
 */
export const SESSION_FEEDBACK_ITEMS = [
  { key: "fun", element: "harmony" },
  { key: "learned", element: "wit" },
  { key: "gedu", element: "valor" },
  { key: "help", element: "glow" },
  { key: "proud", element: "harmony" },
  { key: "belonging", element: "glow" },
  { key: "listened", element: "glow" },
] as const satisfies readonly SessionFeedbackItemDefinition[];

export type SessionFeedbackItemKey =
  (typeof SESSION_FEEDBACK_ITEMS)[number]["key"];

/** What the screen collects: one answer per statement, plus the note. */
export interface SessionFeedbackResult {
  /**
   * Every statement is present; a statement nobody answered carries
   * `undefined`, because an unanswered item is a skip rather than a missing
   * field.
   */
  answers: Record<string, SessionFeedbackRating | undefined>;
  /** Empty when the reader never opened the field, or opened it and wrote nothing. */
  note: string;
}
