import { describe, expect, it } from "vitest";
import {
  answersForStorage,
  isEmptySessionFeedback,
  noteForStorage,
  storedSessionFeedback,
  storedSessionFeedbackAnswers,
} from "@/services/session-feedback/session-feedback.contracts";
import {
  SESSION_FEEDBACK_MAX_ANSWERS,
  SESSION_FEEDBACK_NOTE_MAX_LENGTH,
  type SessionFeedbackRating,
  type SessionFeedbackResult,
} from "@/components/voice/feedback/session-feedback-items";

/**
 * ============================================================================
 * The two turns between a child's form and the column that holds it.
 * ============================================================================
 *
 * The `answers` column is deliberately unconstrained in its keys, so that a
 * statement can be added or removed with no migration — and this pair of pure
 * functions is what that freedom is paid for with. Both directions fail
 * silently if they are wrong: a key the catalogue no longer holds would reach a
 * component as a row nothing can draw, and a skipped statement stored verbatim
 * would file a JSON null that every later reader has to know to ignore.
 */

/** A result over the whole catalogue, with only what a test names answered. */
function result(
  answers: Partial<SessionFeedbackResult["answers"]>,
  note = "",
): SessionFeedbackResult {
  return {
    answers: {
      learned: undefined,
      fun: undefined,
      geduKnowledgeable: undefined,
      geduKind: undefined,
      groupListens: undefined,
      ...answers,
    },
    note,
  };
}

describe("reading a stored answers object back", () => {
  it("keeps the catalogue's own keys at the scale's own values", () => {
    expect(
      storedSessionFeedbackAnswers.parse({ learned: 5, groupListens: 1 }),
    ).toEqual({ learned: 5, groupListens: 1 });
  });

  it("drops a key the catalogue no longer holds", () => {
    // A statement retired from the catalogue leaves its answers behind in rows
    // that were written while it was asked. Nothing can render it, so it does
    // not survive the read — and the answers beside it still do.
    expect(
      storedSessionFeedbackAnswers.parse({ learned: 3, retiredQuestion: 4 }),
    ).toEqual({ learned: 3 });
  });

  it("drops a value outside the five levels of the bar", () => {
    expect(
      storedSessionFeedbackAnswers.parse({
        learned: 9,
        fun: 0,
        geduKind: 2.5,
        geduKnowledgeable: "5",
        groupListens: null,
      }),
    ).toEqual({});
  });

  it("reads an empty object as an empty form", () => {
    expect(storedSessionFeedbackAnswers.parse({})).toEqual({});
  });

  it("reads anything that is not an object as no answers at all", () => {
    // The column's own constraint forbids these; a read that met one would be
    // a form a child could never open, which is the worse of the two failures.
    expect(storedSessionFeedbackAnswers.parse(null)).toEqual({});
    expect(storedSessionFeedbackAnswers.parse([1, 2])).toEqual({});
    expect(storedSessionFeedbackAnswers.parse("learned")).toEqual({});
  });

  it("projects a row onto exactly what the form seeds from", () => {
    expect(
      storedSessionFeedback.parse({
        answers: { fun: 4, nonsense: 4 },
        note: "We built a castle.",
        // Whatever else the row carries is not the form's business.
        updated_at: "2026-09-14T10:40:00+00:00",
      }),
    ).toEqual({ answers: { fun: 4 }, note: "We built a castle." });
  });
});

describe("writing a result into the column", () => {
  it("stores only the statements that were answered", () => {
    expect(answersForStorage(result({ fun: 5, geduKind: 3 }).answers)).toEqual({
      fun: 5,
      geduKind: 3,
    });
  });

  it("stores an untouched form as an empty object, never as five nulls", () => {
    expect(answersForStorage(result({}).answers)).toEqual({});
  });

  it("stores at most the cap's worth of answers, however many it is given", () => {
    // The catalogue asks five, but the stored keys are deliberately
    // unconstrained, so the only thing between a caller and a refused write is
    // this cap — and it is the same number the check constraint owns.
    const extra: Record<string, SessionFeedbackRating> = {};
    for (let i = 0; i < 35; i += 1) extra[`extra_${i}`] = 3;

    const stored = answersForStorage(
      Object.assign(
        result({
          learned: 3,
          fun: 3,
          geduKnowledgeable: 3,
          geduKind: 3,
          groupListens: 3,
        }).answers,
        extra,
      ),
    );
    expect(Object.keys(stored)).toHaveLength(SESSION_FEEDBACK_MAX_ANSWERS);
  });

  it("trims a note to the cap the constraint owns, and nothing else", () => {
    const long = "a".repeat(SESSION_FEEDBACK_NOTE_MAX_LENGTH + 50);
    expect(noteForStorage(long)).toHaveLength(SESSION_FEEDBACK_NOTE_MAX_LENGTH);
    expect(noteForStorage("  it was great\n")).toBe("  it was great\n");
  });

  it("trims by characters, never through the middle of an emoji", () => {
    // The cap is `char_length`, which counts characters; a JavaScript string is
    // indexed in UTF-16 units. A note whose last character straddles the cap
    // would be cut in half by an index-based slice, and the lone surrogate that
    // came out is a string the column refuses — turning the failure this trim
    // exists to prevent into one that no retry of the same write can clear.
    const note = "a".repeat(SESSION_FEEDBACK_NOTE_MAX_LENGTH - 1) + "🎮🎮";
    const stored = noteForStorage(note);

    // The whole emoji survives or it is dropped whole; half of one is not a
    // possible answer. An index-based slice would have ended in a lone
    // surrogate here, one UTF-16 unit longer and unstorable.
    expect(stored).toBe("a".repeat(SESSION_FEEDBACK_NOTE_MAX_LENGTH - 1) + "🎮");
    expect(Array.from(stored)).toHaveLength(SESSION_FEEDBACK_NOTE_MAX_LENGTH);
  });
});

describe("whether a result has anything in it", () => {
  it("is empty with no answer and no note", () => {
    expect(isEmptySessionFeedback(result({}))).toBe(true);
  });

  it("is empty when the note is only whitespace", () => {
    expect(isEmptySessionFeedback(result({}, "   \n"))).toBe(true);
  });

  it("is not empty with one answer, or with a note", () => {
    expect(isEmptySessionFeedback(result({ learned: 1 }))).toBe(false);
    expect(isEmptySessionFeedback(result({}, "it was fun"))).toBe(false);
  });
});
