import type { YtyElementId } from "@/lib/constants/yty";

/**
 * The five levels of the answer bar, in the order they charge.
 *
 * The numbers are the stored shape and the words are what a gamer reads: a bare
 * number on a tap target asks a child to decode a scale before answering, so the
 * bar never draws one. The tuple is the single source of both the order and the
 * values, so the levels cannot be re-ordered without re-ordering the values with
 * them.
 */
export const SESSION_FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const;

export type SessionFeedbackRating = (typeof SESSION_FEEDBACK_RATINGS)[number];

/**
 * The message key each level takes its word from, indexed by the value it stands
 * for. One level's word is shown at a time — the one the bar is charged to.
 */
export const SESSION_FEEDBACK_RATING_KEYS = {
  1: "no",
  2: "notReally",
  3: "aBit",
  4: "yes",
  5: "definitely",
} as const satisfies Record<SessionFeedbackRating, string>;

/**
 * The themes the owner reports on, as the words they used for them.
 *
 * A tuple rather than a bare union so the set is enumerable at runtime if the
 * eventual instrument wants to group by it, and so a typo in a statement's
 * theme is a compile error rather than a new theme nobody asked for.
 */
export const SESSION_FEEDBACK_THEMES = [
  "Learning",
  "Fun",
  "Gedu quality",
  "Belonging",
] as const;

export type SessionFeedbackTheme = (typeof SESSION_FEEDBACK_THEMES)[number];

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
  /**
   * The owner's own word for what this statement is asking about, kept beside
   * the element so the reporting intent survives a rewrite of the sentence.
   *
   * It is not the element and does not map onto it one-to-one — two statements
   * about the Gedu both report into `glow` while being one theme between them —
   * and it is **internal, exactly as the element is**: nothing on the screen
   * groups, labels or orders the statements by it.
   */
  theme: SessionFeedbackTheme;
}

/**
 * The five statements a gamer is asked after an online session, in the order
 * they are asked.
 *
 * One place, because three things have to agree about them — the screen, the
 * message catalogue and whatever eventually stores an answer — and the order is
 * part of the question: the same statements read in a different order are a
 * different questionnaire.
 */
export const SESSION_FEEDBACK_ITEMS = [
  { key: "learned", element: "wit", theme: "Learning" },
  { key: "fun", element: "harmony", theme: "Fun" },
  { key: "geduKnowledgeable", element: "glow", theme: "Gedu quality" },
  { key: "geduKind", element: "glow", theme: "Gedu quality" },
  { key: "groupListens", element: "glow", theme: "Belonging" },
] as const satisfies readonly SessionFeedbackItemDefinition[];

export type SessionFeedbackItemKey =
  (typeof SESSION_FEEDBACK_ITEMS)[number]["key"];

/**
 * What the screen collects: one answer per statement, plus the note.
 *
 * Keyed on the catalogue's own identifiers rather than on `string`, so a result
 * cannot carry a statement nothing in the catalogue asks. The parameter is what
 * lets a caller asking a subset — a test, a scene exercising two rows — be typed
 * to exactly the subset it asked, while the live caller's `K` is the whole
 * catalogue.
 */
export interface SessionFeedbackResult<
  K extends SessionFeedbackItemKey = SessionFeedbackItemKey,
> {
  /**
   * Every statement asked is present; a statement nobody answered carries
   * `undefined`, because an unanswered item is a skip rather than a missing
   * field.
   */
  answers: Record<K, SessionFeedbackRating | undefined>;
  /** Empty when the reader never opened the field, or opened it and wrote nothing. */
  note: string;
}

/**
 * The most answers one stored result may carry.
 *
 * **The database's check constraint owns this cap; the number here only mirrors
 * it**, so a writer cannot measure it differently and walk into a refusal it
 * could have avoided. It sits far above the five statements asked today on
 * purpose: the stored keys are deliberately unconstrained so a statement can be
 * added or removed without a migration, and this is the bound on that freedom
 * rather than a count of the catalogue.
 */
export const SESSION_FEEDBACK_MAX_ANSWERS = 32;

/**
 * The longest note that may be stored, in characters.
 *
 * The same mirror of the same constraint: the cap is enforced by the schema, and
 * a writer trims to it rather than handing over a note the row would refuse — a
 * child's words arriving shortened beats a Done that cannot succeed.
 */
export const SESSION_FEEDBACK_NOTE_MAX_LENGTH = 2000;
