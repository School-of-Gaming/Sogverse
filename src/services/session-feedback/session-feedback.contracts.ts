import { z } from "zod";
import {
  SESSION_FEEDBACK_ITEMS,
  SESSION_FEEDBACK_MAX_ANSWERS,
  SESSION_FEEDBACK_NOTE_MAX_LENGTH,
  SESSION_FEEDBACK_RATINGS,
  type SessionFeedbackItemKey,
  type SessionFeedbackRating,
  type SessionFeedbackResult,
} from "@/components/voice/feedback/session-feedback-items";
import type { SessionFeedbackInitialState } from "@/components/voice/feedback/SessionFeedbackScreen";

/**
 * The two directions one stored row travels, as one pair of pure turns.
 *
 * The answers column is `jsonb`, so it arrives as untyped JSON and leaves as
 * whatever the writer puts in it — and the schema deliberately constrains only
 * the *shape*, never the keys, so that adding or removing a statement is a code
 * edit with no migration. **That freedom is paid for here**: this file is the
 * one place a stored object is narrowed back to the catalogue the screen asks
 * from, and the one place a screen's result is flattened into what the column
 * holds. A key the catalogue no longer knows, and a level outside the scale,
 * are both dropped on the way in rather than reaching a component as a value
 * nothing can render.
 */

const CATALOGUE_KEYS: ReadonlySet<string> = new Set(
  SESSION_FEEDBACK_ITEMS.map((item) => item.key),
);

const RATINGS: ReadonlySet<number> = new Set(SESSION_FEEDBACK_RATINGS);

/** Whether a stored key is one the catalogue still asks about. */
function isItemKey(key: string): key is SessionFeedbackItemKey {
  return CATALOGUE_KEYS.has(key);
}

/** Whether a stored value is one of the five levels of the bar. */
function isRating(value: unknown): value is SessionFeedbackRating {
  return typeof value === "number" && RATINGS.has(value);
}

/**
 * The stored answers object, narrowed to what the screen can seed a form from.
 *
 * Everything it cannot use is dropped rather than refused: this read exists to
 * prefill a form, and a single unrecognised key must never be the reason a child
 * meets an empty one. A value that is not an object at all — which the column's
 * own constraint already forbids — reads as no answers for the same reason.
 */
export const storedSessionFeedbackAnswers = z
  .unknown()
  .transform((raw): Partial<Record<SessionFeedbackItemKey, SessionFeedbackRating>> => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};

    const answers: Partial<Record<SessionFeedbackItemKey, SessionFeedbackRating>> =
      {};
    for (const [key, value] of Object.entries(raw)) {
      if (!isItemKey(key)) continue;
      if (!isRating(value)) continue;
      answers[key] = value;
    }
    return answers;
  });

/**
 * One stored row as the screen's initial state.
 *
 * The row carries more than the form does — the key it is filed under and the
 * timestamps — and none of it is the form's business, so the parse is
 * also the projection.
 */
export const storedSessionFeedback = z
  .object({
    answers: storedSessionFeedbackAnswers,
    note: z.string(),
  })
  .transform(
    (row): SessionFeedbackInitialState => ({
      answers: row.answers,
      note: row.note,
    }),
  );

/**
 * The screen's result as the column holds it: only the statements that were
 * actually answered.
 *
 * An unanswered statement is a skip, and the screen reports one as `undefined`
 * against a key that is still present — so storing the result verbatim would
 * file every skip as a JSON null and turn "nobody answered this" into a value a
 * reader has to know to ignore. The cap is applied here too, mirroring the
 * constraint that owns it.
 */
export function answersForStorage(
  answers: SessionFeedbackResult["answers"],
): Record<string, SessionFeedbackRating> {
  const stored: Record<string, SessionFeedbackRating> = {};
  for (const [key, rating] of Object.entries(answers)) {
    if (!isRating(rating)) continue;
    if (Object.keys(stored).length >= SESSION_FEEDBACK_MAX_ANSWERS) break;
    stored[key] = rating;
  }
  return stored;
}

/**
 * The note as the column holds it — trimmed to the cap and nothing else.
 *
 * The child's own words are not otherwise touched: leading spaces, line breaks
 * and all are theirs, and a writer that tidied them would be editing what
 * somebody wrote.
 *
 * **Trimmed by code points, because the cap is counted in characters.** A
 * JavaScript string is indexed in UTF-16 units, so cutting at the cap can land
 * between the halves of a surrogate pair — an emoji, which is exactly what a
 * child fills a long note with — and produce a lone surrogate the column
 * refuses outright. A trim that hands over an unstorable string turns the
 * failure it exists to prevent into one no retry of the same write can ever
 * clear.
 */
export function noteForStorage(note: string): string {
  return Array.from(note).slice(0, SESSION_FEEDBACK_NOTE_MAX_LENGTH).join("");
}

/**
 * Whether a result has nothing in it — no answer anywhere, and no note.
 *
 * It is the first half of the write-or-skip rule, and it lives beside the
 * storage turns because it asks the same question of the same value: is there
 * anything here a row would hold? Whitespace alone counts as nothing, so a
 * stray space bar does not manufacture a row.
 */
export function isEmptySessionFeedback(result: SessionFeedbackResult): boolean {
  if (result.note.trim().length > 0) return false;
  return Object.values(result.answers).every((rating) => !isRating(rating));
}
