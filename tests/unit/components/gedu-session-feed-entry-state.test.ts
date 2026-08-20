import { describe, it, expect } from "vitest";
import {
  applyDraftToEntry,
  applyPlanDraftToEntry,
  attendanceTally,
  countEntriesNeedingAttention,
  draftFromEditorState,
  editorStateFromEntry,
  entryCompleteness,
  entryIsComplete,
  entryNeedsAttention,
  isEditableEntry,
  isPlannableEntry,
  planDraftFromEditorState,
  planEditorStateFromEntry,
  rosterScopedMarks,
} from "@/components/gedu/session-feed/entry-state";
import type {
  FutureSessionFeedEntry,
  NoRecordSessionFeedEntry,
  PastSessionFeedEntry,
  SessionEditor,
  SessionEditorState,
  SessionFeedEntry,
  SessionFeedGamer,
} from "@/components/gedu/session-feed/types";

/**
 * Somebody the database has already stamped on a session.
 *
 * A real UUID literal because that is what the field promises — the id seeds an
 * identicon wherever one of these reaches a chip — and hardcoded rather than
 * generated so the fixture is the same person on every run.
 */
const EDITOR: SessionEditor = {
  id: "a61e404b-99ea-4d92-b462-eac895cf4150",
  firstName: "Sanna",
};

/**
 * Three seats. What a session owes does not change with who can be written to —
 * deliberately, because a group nobody can be mailed must not sit flagged for
 * ever with nothing to do about it — so a roster here is ids and names, exactly
 * as the register needs them.
 */
const ROSTER: SessionFeedGamer[] = [
  { id: "a", firstName: "Aino" },
  { id: "b", firstName: "Väinö" },
  { id: "c", firstName: "Elias" },
];

/**
 * Every roster member answered — one of the two halves an owed session needs.
 * On its own it no longer clears the alert; a report has to land as well.
 */
const ALL_MARKED = { a: "present", b: "absent", c: "present" } as const;

/**
 * The evening a report went out to the families — the third thing an owed
 * session owes.
 *
 * The `past` fixture below leaves it **null**, which is the state every session
 * starts in, so a case expecting the green check has to say all three parts out
 * loud rather than inheriting two of them.
 */
const EMAILED_AT = new Date("2026-03-02T19:00:00.000Z");

const START = new Date("2026-03-02T14:30:00.000Z");
const END = new Date("2026-03-02T16:00:00.000Z");
const WHEN = { startsAt: START, endsAt: END };

/**
 * A **finished** session inside the enforcement window — write-ups owed.
 *
 * Both halves matter: the merge sets `owed` only when the date is on or after
 * the epoch *and* the session's end instant has passed.
 */
function past(
  id: string,
  fields: Partial<
    Omit<PastSessionFeedEntry, "kind" | "id" | "startsAt" | "endsAt">
  > = {},
): PastSessionFeedEntry {
  return {
    kind: "past",
    id,
    ...WHEN,
    report: null,
    staffNote: null,
    attendance: {},
    owed: true,
    // Never emailed by default: a session that has not been written up cannot
    // have been sent, and a case about the check says so itself.
    reportEmailedAt: null,
    // Unsigned by default: these derivations are about what a session owes and
    // what its editors do, none of which turns on who last touched it.
    lastEditedBy: null,
    ...fields,
  };
}
/**
 * The same session with `owed` false: recordable, but nothing is asked of it.
 *
 * Two different sessions arrive here, and the derivations below cannot tell them
 * apart because they do not need to — the merge collapses both into this one
 * flag. One is dated before the enforcement epoch, so the platform never asked.
 * The other has **started and not yet ended**, so the gedu is still in the room
 * and the hour has not run out. Either way the warning is off, and the green
 * check is still reachable by finishing both halves.
 */
function unowedPast(
  id: string,
  fields: Partial<
    Omit<PastSessionFeedEntry, "kind" | "id" | "startsAt" | "endsAt" | "owed">
  > = {},
): PastSessionFeedEntry {
  return past(id, { ...fields, owed: false });
}
function noRecord(id: string): NoRecordSessionFeedEntry {
  return { kind: "no_record", id, ...WHEN };
}
/** A session finished on all three parts: marked off, written up, and sent. */
function sentPast(
  id: string,
  fields: Partial<
    Omit<PastSessionFeedEntry, "kind" | "id" | "startsAt" | "endsAt">
  > = {},
): PastSessionFeedEntry {
  return past(id, {
    attendance: ALL_MARKED,
    report: "# Redstone week",
    reportEmailedAt: EMAILED_AT,
    ...fields,
  });
}
function future(
  id: string,
  fields: Partial<
    Omit<FutureSessionFeedEntry, "kind" | "id" | "startsAt" | "endsAt">
  > = {},
): FutureSessionFeedEntry {
  return {
    kind: "future",
    id,
    ...WHEN,
    report: null,
    staffNote: null,
    attendance: {},
    lastEditedBy: null,
    ...fields,
  };
}

/**
 * Two instants either side of the fixture session, for the predicates that now
 * take a clock.
 *
 * `BEFORE_START` is the ordinary future case — nothing has begun. `MID_SESSION`
 * sits between the fixture's start and end, which is the **live** case: since
 * the kind flips at the session's *end*, that entry is still `future`, and the
 * register is open because the session has started.
 */
const BEFORE_START = new Date("2026-03-02T09:00:00.000Z");
const MID_SESSION = new Date("2026-03-02T15:00:00.000Z");
const AFTER_END = new Date("2026-03-02T18:00:00.000Z");

/**
 * Editability is **not** the epoch's business, and this is where the two
 * questions are held apart. What is *owed* stops at the enforcement epoch; what
 * can be *recorded* reaches back to the product's start date, so a pre-epoch
 * gap opens the very same editor last week's session does.
 *
 * The one exclusion is a future session that **has not started**. It is no
 * longer the same statement as "is not a future entry": the kind flips at the
 * session's end, so the session in progress is a future entry *and* is
 * editable. That is the roll-call case, and it is why these predicates take a
 * clock at all.
 */
describe("isEditableEntry", () => {
  it("accepts a past session whether or not anything is recorded on it", () => {
    expect(
      isEditableEntry(past("r", { attendance: ALL_MARKED }), AFTER_END),
    ).toBe(true);
    expect(isEditableEntry(past("g"), AFTER_END)).toBe(true);
  });

  it("accepts a pre-epoch gap — nothing is owed, everything is editable", () => {
    expect(isEditableEntry(noRecord("n"), AFTER_END)).toBe(true);
  });

  it("accepts a pre-epoch session somebody went back and recorded", () => {
    expect(
      isEditableEntry(unowedPast("o", { attendance: ALL_MARKED }), AFTER_END),
    ).toBe(true);
  });

  it("rejects a future session that has not started", () => {
    expect(isEditableEntry(future("u"), BEFORE_START)).toBe(false);
  });

  /*
   * THE ROLL-CALL CASE. A gedu takes the register and writes the report while
   * the session is running, and that has to keep working now the running
   * session is classified `future` rather than `past`.
   *
   * The scenario that surfaced this is a daily camp scheduled 8:00-23:00. Under
   * the old start-based split the session dropped into history at 8:00 and the
   * workspace spent the next fifteen hours calling it "last time" and naming
   * tomorrow as next - while the gedu was still standing in it. A ninety-minute
   * club hid the problem; a fifteen-hour one makes it the whole day.
   */
  it("accepts a future session that has already started — roll call", () => {
    expect(isEditableEntry(future("live"), MID_SESSION)).toBe(true);
  });

  /*
   * THE INCOHERENT PAIR, and why these predicates say "is live" rather than
   * "has started".
   *
   * A `future` entry paired with a clock past its own `endsAt` cannot come out
   * of the builder — the kind means "has not ended", so entries and clock are
   * built from one instant and agree. It arises only when somebody hands these
   * predicates a FRESHER clock than the entries were built from, which is
   * exactly the defect they were reconciled with the feed component to prevent:
   * the workspace freezes the feed's clock while an editor is open, and a
   * component reading the ticking provider instead produced precisely this pair
   * and swapped the open editor out from under a gedu mid-roll-call.
   *
   * Pinned here so the pair stays total and disjoint even on input that should
   * never occur. Both predicates are one expression and its negation, so no
   * clock — coherent or not — can produce an entry offering two editors or
   * none. Under the old start-only definition this same entry was editable
   * *and* plannable's complement disagreed with the component's own rule, which
   * is the drift that let the two definitions come apart unnoticed.
   */
  it("holds a stale future entry to exactly one editor", () => {
    const stale = future("stale");
    expect(isEditableEntry(stale, AFTER_END)).toBe(false);
    expect(isPlannableEntry(stale, AFTER_END)).toBe(true);
  });
});

describe("isPlannableEntry", () => {
  it("accepts only a future session that has not started", () => {
    expect(isPlannableEntry(future("u"), BEFORE_START)).toBe(true);
    expect(isPlannableEntry(past("g"), AFTER_END)).toBe(false);
    expect(isPlannableEntry(noRecord("n"), AFTER_END)).toBe(false);
  });

  // The live session takes the *record* editor, not the notes-only one: a
  // register it cannot reach is exactly the regression this whole change had
  // to avoid.
  it("rejects the session in progress — that one records", () => {
    expect(isPlannableEntry(future("live"), MID_SESSION)).toBe(false);
  });

  it("never overlaps with the record editor's set", () => {
    const cases: [SessionFeedEntry, Date][] = [
      [future("u"), BEFORE_START],
      [future("live"), MID_SESSION],
      // The pair the builder never emits — see the stale-entry case above.
      [future("stale"), AFTER_END],
      [past("r", { attendance: ALL_MARKED }), AFTER_END],
      [past("g"), AFTER_END],
      [unowedPast("o"), AFTER_END],
      [noRecord("n"), AFTER_END],
    ];
    for (const [entry, now] of cases) {
      expect(isEditableEntry(entry, now) && isPlannableEntry(entry, now)).toBe(
        false,
      );
    }
  });

  it("covers every entry between them — nothing opens no editor at all", () => {
    const cases: [SessionFeedEntry, Date][] = [
      [future("u"), BEFORE_START],
      [future("live"), MID_SESSION],
      // The pair the builder never emits — see the stale-entry case above.
      [future("stale"), AFTER_END],
      [past("g"), AFTER_END],
      [unowedPast("o"), AFTER_END],
      [noRecord("n"), AFTER_END],
    ];
    for (const [entry, now] of cases) {
      expect(
        isEditableEntry(entry, now) || isPlannableEntry(entry, now),
        entry.id,
      ).toBe(true);
    }
  });
});

/**
 * Two states and a silence. An owed session is flagged until **both** halves are
 * in — every current roster member answered, and a report written for the
 * families — and it wears the green check once they are. Everything else says
 * nothing at all.
 *
 * The report used to be exempt: a marked-off session with nothing written sat on
 * a silent middle rung, because a report was optional and a badge there would
 * have nagged for work nobody owed. The family surfaces render the report as the
 * thing a parent opens the page to read, so it is owed work now, and the tests
 * below are written against that reversal rather than around it.
 */
describe("entryCompleteness", () => {
  it("flags an owed session until both halves are in", () => {
    // Nothing at all.
    expect(entryCompleteness(past("a"), ROSTER)).toBe("needs_attention");
    // The register finished, and no word to the families. The case the rule
    // change is about — this used to be silent.
    expect(
      entryCompleteness(past("b", { attendance: ALL_MARKED }), ROSTER),
    ).toBe("needs_attention");
    // A report with the register unfinished — the mirror image, and flagged for
    // as long as it always was.
    expect(
      entryCompleteness(past("c", { report: "# Redstone week" }), ROSTER),
    ).toBe("needs_attention");
    // Written up and never sent — the third gap, and the one this feature
    // added. The families have a report on their page and were told nothing
    // about it, which is a session that has not finished doing its job.
    expect(
      entryCompleteness(
        past("d", { attendance: ALL_MARKED, report: "# Redstone week" }),
        ROSTER,
      ),
    ).toBe("needs_attention");
    // All three.
    expect(entryCompleteness(sentPast("e"), ROSTER)).toBe("complete");
  });

  /**
   * The email half, on its own, in both directions.
   *
   * It is the only one of the three that is gated on the session being owed:
   * this branch has no epoch floor, so asking it of everything would have
   * stripped the check off every finished session in history and made it
   * re-earnable only by mailing a months-old write-up to families.
   */
  it("asks an owed session for the send, and a pre-epoch one for nothing", () => {
    const parts = { attendance: ALL_MARKED, report: "# Redstone week" };
    expect(entryCompleteness(past("owed", parts), ROSTER)).toBe(
      "needs_attention",
    );
    expect(
      entryCompleteness(
        past("sent", { ...parts, reportEmailedAt: EMAILED_AT }),
        ROSTER,
      ),
    ).toBe("complete");
    // Before the epoch: nothing was ever asked for, so the two parts somebody
    // did go back and complete earn the check without a send.
    expect(entryCompleteness(unowedPast("old", parts), ROSTER)).toBe(
      "complete",
    );
  });

  it("keeps a half-marked register flagged even with a report on it", () => {
    // No part buys off another, in any direction — a session sent to every
    // family with half its register unmarked is still unfinished.
    expect(
      entryCompleteness(
        past("e", { attendance: { a: "present" }, report: "# Redstone week" }),
        ROSTER,
      ),
    ).toBe("needs_attention");
    expect(
      entryCompleteness(sentPast("f", { attendance: { a: "present" } }), ROSTER),
    ).toBe("needs_attention");
  });

  it("treats a gedu note as no substitute for the report", () => {
    // The gedu note is a message to a colleague; families never see it, so it
    // cannot be what discharges the write-up they are owed.
    expect(
      entryCompleteness(
        past("note", { attendance: ALL_MARKED, staffNote: "Watch Siiri." }),
        ROSTER,
      ),
    ).toBe("needs_attention");
  });

  it("counts an empty or whitespace-only report as no report", () => {
    // A cleared editor saves as `""` before it collapses to null, and a field
    // holding one space is not a write-up. Both are the same answer as null,
    // and the SQL behind the dashboard badge trims for the same reason.
    expect(
      entryCompleteness(sentPast("g", { report: "" }), ROSTER),
    ).toBe("needs_attention");
    expect(
      entryCompleteness(sentPast("h", { report: "  \n " }), ROSTER),
    ).toBe("needs_attention");
  });

  it("exempts future entries and untouched pre-epoch gaps entirely", () => {
    expect(entryCompleteness(future("u"), ROSTER)).toBeNull();
    expect(entryCompleteness(noRecord("n"), ROSTER)).toBeNull();
  });

  it("says nothing at all about an entry that owes nothing", () => {
    // An unfinished session nobody is owed one for — pre-epoch, or still
    // running — is not outstanding work and has nothing to boast about either,
    // so it is silent whichever half is missing.
    expect(entryCompleteness(unowedPast("a"), ROSTER)).toBeNull();
    expect(
      entryCompleteness(unowedPast("b", { attendance: { a: "present" } }), ROSTER),
    ).toBeNull();
    expect(
      entryCompleteness(unowedPast("c", { report: "# From memory" }), ROSTER),
    ).toBeNull();
    expect(
      entryCompleteness(unowedPast("d", { attendance: ALL_MARKED }), ROSTER),
    ).toBeNull();
  });

  it("still lets a pre-epoch session reach the green check", () => {
    // Somebody who goes back and finishes an old session gets the check for it.
    // Only the warning is switched off, not the reward.
    expect(
      entryCompleteness(
        unowedPast("e", { attendance: ALL_MARKED, report: "# From memory" }),
        ROSTER,
      ),
    ).toBe("complete");
  });

  it("never flags a group with nobody in it, but keeps its checks", () => {
    // No register to finish and no family to write to, so an empty roster must
    // not become a backlog of one alert per week — the dashboard's server-side
    // count exempts it the same way, and the two have to agree or the badge and
    // the feed behind it tell different stories.
    expect(entryCompleteness(past("i"), [])).toBeNull();
    // Only the warning is suppressed. A week finished while the group still had
    // children in it keeps its check after the last of them leaves, rather than
    // a year of history going grey the day a club empties out.
    expect(
      entryCompleteness(
        past("j", { report: "# Week", reportEmailedAt: EMAILED_AT }),
        [],
      ),
    ).toBe("complete");
  });

  it("reopens when a child joins the group after the sheet was finished", () => {
    // Measured against the *current* roster, never the stored map's keys —
    // nobody has yet said whether the new child was there.
    const entry = sentPast("k");
    expect(entryCompleteness(entry, ROSTER)).toBe("complete");
    expect(
      entryCompleteness(entry, [
        ...ROSTER,
        { id: "d", firstName: "Linnéa" },
      ]),
    ).toBe("needs_attention");
  });
});

describe("entryIsComplete", () => {
  it("is the target state and nothing else", () => {
    expect(entryIsComplete(sentPast("a"), ROSTER)).toBe(true);
    expect(entryIsComplete(past("b", { attendance: ALL_MARKED }), ROSTER)).toBe(
      false,
    );
    // Written up, never sent: two parts of three.
    expect(
      entryIsComplete(
        past("c", { attendance: ALL_MARKED, report: "# Week" }),
        ROSTER,
      ),
    ).toBe(false);
    expect(entryIsComplete(past("d"), ROSTER)).toBe(false);
  });

  it("is never true at the same time as needing attention", () => {
    const entries: SessionFeedEntry[] = [
      past("a"),
      past("b", { attendance: ALL_MARKED }),
      sentPast("c"),
      past("d", { report: "# Week" }),
      future("u"),
      noRecord("n"),
    ];
    for (const entry of entries) {
      expect(
        entryIsComplete(entry, ROSTER) && entryNeedsAttention(entry, ROSTER),
        entry.id,
      ).toBe(false);
    }
  });
});

describe("entryNeedsAttention", () => {
  it("is exactly: a finished session missing its register, its report, or both", () => {
    expect(entryNeedsAttention(past("g"), ROSTER)).toBe(true);
    expect(entryNeedsAttention(sentPast("r"), ROSTER)).toBe(false);
    expect(entryNeedsAttention(noRecord("n"), ROSTER)).toBe(false);
    expect(entryNeedsAttention(future("f"), ROSTER)).toBe(false);
  });

  it("still flags a session that has both notes but no attendance", () => {
    // Attendance doubles as the ran-confirmation the gedu is paid on, so a full
    // write-up does not discharge it. The entry renders its notes *and* its
    // alert.
    expect(
      entryNeedsAttention(
        past("g", { report: "Redstone week.", staffNote: "Watch Siiri." }),
        ROSTER,
      ),
    ).toBe(true);
  });

  it("flags a fully-marked session that was never written up", () => {
    // The reversal, stated as plainly as it can be: the register is done and
    // the entry is still owed, because the families have been told nothing. A
    // gedu note does not count — nobody outside staff can read it.
    expect(
      entryNeedsAttention(past("r", { attendance: ALL_MARKED }), ROSTER),
    ).toBe(true);
    expect(
      entryNeedsAttention(
        past("s", { attendance: ALL_MARKED, staffNote: "Watch Siiri." }),
        ROSTER,
      ),
    ).toBe(true);
  });

  it("keeps flagging a finished write-up until it has been emailed", () => {
    // The third part, in the order a gedu meets it: the register is done, the
    // report is written, and the families have not been told it exists.
    expect(
      entryNeedsAttention(
        past("t", { attendance: ALL_MARKED, report: "# Redstone week" }),
        ROSTER,
      ),
    ).toBe(true);
  });

  it("clears once the write-up has been sent as well", () => {
    expect(entryNeedsAttention(sentPast("t"), ROSTER)).toBe(false);
  });

  it("keeps flagging a partially-marked session", () => {
    // The whole point of allowing a partial save: the work saved, and the entry
    // still asks for the rest of it.
    expect(
      entryNeedsAttention(past("p", { attendance: { a: "present" } }), ROSTER),
    ).toBe(true);
    expect(
      entryNeedsAttention(
        past("p", { attendance: { a: "present", b: "absent" } }),
        ROSTER,
      ),
    ).toBe(true);
  });

  it("treats an all-absent record as an answered register, not an empty one", () => {
    // "Everybody was away" is a real claim, and marking every row absent is how
    // it is made — nothing like a sheet nobody has touched. With the write-up
    // on it too, the entry is done.
    expect(
      entryNeedsAttention(
        sentPast("r", {
          attendance: { a: "absent", b: "absent", c: "absent" },
          report: "# Nobody came",
        }),
        ROSTER,
      ),
    ).toBe(false);
  });

  it("reopens when a child joins the group after the session was marked", () => {
    // Measured against the *current* roster: nobody has said whether the new
    // child was there, so the honest answer is that the sheet is unfinished.
    const entry = sentPast("r");
    const grown = [
      ...ROSTER,
      { id: "d", firstName: "Linnéa" },
    ];
    expect(entryNeedsAttention(entry, ROSTER)).toBe(false);
    expect(entryNeedsAttention(entry, grown)).toBe(true);
  });

  it("never flags a session from before the enforcement epoch", () => {
    // Nothing was ever asked of it, so however little is recorded it is not
    // outstanding work — and it must not add to a dashboard badge either.
    expect(entryNeedsAttention(unowedPast("o"), ROSTER)).toBe(false);
    expect(
      entryNeedsAttention(unowedPast("p", { attendance: { a: "present" } }), ROSTER),
    ).toBe(false);
  });

  it("never flags a session that has started but not yet ended", () => {
    // The other thing `owed: false` means. A gedu part-way through the register
    // of the club they are standing in has not failed to do anything yet, and
    // the SQL count that feeds the dashboard badge waits for the end instant
    // too — so an amber marker here would be the client disagreeing with the
    // badge as well as nagging early.
    expect(entryNeedsAttention(unowedPast("live"), ROSTER)).toBe(false);
    expect(
      entryNeedsAttention(
        unowedPast("half", { attendance: { a: "present", b: "absent" } }),
        ROSTER,
      ),
    ).toBe(false);
  });

  it("still flags it once the session has ended and the sheet is unfinished", () => {
    // The transition the end boundary exists to make: same entry, same partial
    // sheet, and the only thing that changed is that the hour ran out.
    expect(
      entryNeedsAttention(past("ended", { attendance: { a: "present" } }), ROSTER),
    ).toBe(true);
  });

  it("never flags anything against an empty roster", () => {
    // No register to finish and no family to write to. It matters more now than
    // it did: with the report owed as well, a group with nobody in it would
    // otherwise manufacture one alert per week for ever.
    expect(entryNeedsAttention(past("g"), [])).toBe(false);
    expect(entryNeedsAttention(past("r", { report: "# Week" }), [])).toBe(false);
    // Not even for the send, which is the one part an empty group could in
    // principle still be asked for — there is nobody to send to.
    expect(
      entryNeedsAttention(past("s", { attendance: ALL_MARKED }), []),
    ).toBe(false);
  });
});

describe("countEntriesNeedingAttention", () => {
  it("counts every owed entry missing either half", () => {
    const entries: SessionFeedEntry[] = [
      future("u"),
      // Nothing on it.
      past("g1"),
      // A report and no register.
      past("g2", { report: "Notes but no attendance." }),
      // A part-marked register and no report.
      past("g3", { attendance: { a: "present" } }),
      // A finished register and no report — counted now, silent before.
      past("g4", { attendance: ALL_MARKED }),
      // Marked off and written up, never emailed — counted for the third gap.
      past("g5", { attendance: ALL_MARKED, report: "# Week" }),
      // All three parts in: the only past entry here that is not work.
      sentPast("done"),
      unowedPast("o"),
      noRecord("n"),
    ];
    expect(countEntriesNeedingAttention(entries, ROSTER)).toBe(5);
  });

  it("is zero for an empty feed", () => {
    expect(countEntriesNeedingAttention([], ROSTER)).toBe(0);
  });
});

describe("planEditorStateFromEntry / planDraftFromEditorState", () => {
  it("seeds a session with no notes on it with empty fields", () => {
    expect(planEditorStateFromEntry(future("f"))).toEqual({
      report: "",
      staffNote: "",
    });
  });

  it("seeds from existing notes, mapping nulls to empty strings", () => {
    expect(
      planEditorStateFromEntry(
        future("f", {
          report: "Redstone follow-up.",
          staffNote: "Charge the laptop.",
        }),
      ),
    ).toEqual({
      report: "Redstone follow-up.",
      staffNote: "Charge the laptop.",
    });
  });

  it("trims both notes on the way out", () => {
    expect(
      planDraftFromEditorState({
        report: "  Harbour road.  ",
        staffNote: "  Pair Siiri with Aino.  ",
      }),
    ).toEqual({
      kind: "plan",
      report: "Harbour road.",
      staffNote: "Pair Siiri with Aino.",
    });
  });
});

describe("applyPlanDraftToEntry", () => {
  it("folds notes back in, keeping identity and schedule", () => {
    const entry = future("f");
    expect(
      applyPlanDraftToEntry(entry, {
        kind: "plan",
        report: "Lighthouse week.",
        staffNote: "Bring the spare mouse.",
      }),
    ).toEqual({
      kind: "future",
      id: "f",
      startsAt: START,
      endsAt: END,
      report: "Lighthouse week.",
      staffNote: "Bring the spare mouse.",
      // A future entry carries a sheet now, because one of them can be the
      // session in progress. Planning notes never touch it.
      attendance: {},
      // Carried through rather than rewritten: the stamp is the database's, and
      // folding a draft in locally must not invent a name the next read could
      // contradict.
      lastEditedBy: null,
    });
  });

  /*
   * The carry-through, asserted against somebody rather than against the
   * default null — which is the only version of this that can fail. An entry
   * already stamped by Sanna comes back stamped by Sanna, however much of its
   * text the draft rewrites: this function does not know who is saving, the
   * stamp is the database's, and the authoritative answer arrives with the
   * refetched row.
   */
  it("keeps the existing editor on the folded entry", () => {
    const entry = future("f", {
      report: "Lighthouse week.",
      lastEditedBy: EDITOR,
    });
    const folded = applyPlanDraftToEntry(entry, {
      kind: "plan",
      report: "Harbour road instead.",
      staffNote: "Bring the spare mouse.",
    });
    expect(folded.report).toBe("Harbour road instead.");
    expect(folded.lastEditedBy).toEqual(EDITOR);
  });

  it("collapses cleared notes to null so their blocks stop rendering", () => {
    const entry = future("f", { report: "old", staffNote: "old" });
    expect(
      applyPlanDraftToEntry(entry, {
        kind: "plan",
        report: "",
        staffNote: "",
      }),
    ).toMatchObject({ report: null, staffNote: null });
  });

  it("round-trips notes through the editor without losing anything", () => {
    const entry = future("f", {
      report: "Lighthouse week.",
      staffNote: "Bring the spare mouse.",
    });
    expect(
      applyPlanDraftToEntry(
        entry,
        planDraftFromEditorState(planEditorStateFromEntry(entry)),
      ),
    ).toEqual(entry);
  });
});

describe("attendanceTally", () => {
  it("counts present, marked and completeness in one pass", () => {
    expect(attendanceTally(ROSTER, ALL_MARKED)).toEqual({
      present: 2,
      marked: 3,
      total: 3,
      complete: true,
    });
  });

  it("is incomplete while any roster member is unmarked", () => {
    expect(attendanceTally(ROSTER, { a: "present" })).toEqual({
      present: 1,
      marked: 1,
      total: 3,
      complete: false,
    });
  });

  it("counts over the roster, so a departed child can't skew either number", () => {
    // A child who left the group leaves a key behind; counting keys would both
    // report "3 of 3 present" on two survivors and make an unfinished sheet
    // look complete.
    expect(
      attendanceTally(ROSTER, {
        a: "present",
        b: "absent",
        departed: "present",
      }),
    ).toEqual({ present: 1, marked: 2, total: 3, complete: false });
  });

  it("is trivially complete for an empty roster", () => {
    expect(attendanceTally([], {})).toEqual({
      present: 0,
      marked: 0,
      total: 0,
      complete: true,
    });
  });

  it("treats an untouched sheet as zero marked, not zero present", () => {
    expect(attendanceTally(ROSTER, {})).toEqual({
      present: 0,
      marked: 0,
      total: 3,
      complete: false,
    });
  });
});

describe("rosterScopedMarks", () => {
  it("keeps every mark belonging to a current roster member", () => {
    expect(rosterScopedMarks(ROSTER, ALL_MARKED)).toEqual(ALL_MARKED);
  });

  it("drops a mark for a child who has left the group", () => {
    expect(
      rosterScopedMarks(ROSTER, { a: "present", departed: "absent" }),
    ).toEqual({ a: "present" });
  });

  it("leaves an unmarked roster member out rather than inventing a mark", () => {
    expect(rosterScopedMarks(ROSTER, { b: "absent" })).toEqual({ b: "absent" });
  });
});

describe("editorStateFromEntry", () => {
  it("opens an untouched session with every row unmarked", () => {
    // Never pre-ticked: a gedu must not be able to save a room they never
    // looked at as a room full of children who were present.
    expect(editorStateFromEntry(past("g"), ROSTER)).toEqual({
      attendance: {},
      report: "",
      staffNote: "",
    });
  });

  it("keeps an unmarked session's existing notes when it opens", () => {
    const state = editorStateFromEntry(
      past("g", { report: "Redstone week.", staffNote: "Watch Siiri." }),
      ROSTER,
    );
    expect(state.report).toBe("Redstone week.");
    expect(state.staffNote).toBe("Watch Siiri.");
    expect(state.attendance).toEqual({});
  });

  it("reopens a finished session showing exactly what was saved", () => {
    expect(
      editorStateFromEntry(
        past("r", {
          report: "We built a clock tower.",
          attendance: ALL_MARKED,
        }),
        ROSTER,
      ),
    ).toEqual({
      attendance: { a: "present", b: "absent", c: "present" },
      report: "We built a clock tower.",
      staffNote: "",
    });
  });

  it("reopens a partial save on the marks already made, not on a blank sheet", () => {
    // The reason a partial save is worth allowing at all: the gedu comes back
    // to one row left rather than three.
    const state = editorStateFromEntry(
      past("p", { attendance: { a: "present", b: "absent" } }),
      ROSTER,
    );
    expect(state.attendance).toEqual({ a: "present", b: "absent" });
  });

  it("drops a departed child's stale mark as the editor opens", () => {
    const state = editorStateFromEntry(
      past("p", { attendance: { a: "present", departed: "absent" } }),
      ROSTER,
    );
    expect(state.attendance).toEqual({ a: "present" });
  });

  it("opens a pre-epoch gap on a blank sheet with blank notes", () => {
    // It is exactly what it says it is: an occurrence nobody has ever written
    // anything against. The editor is the same one, seeded with nothing.
    expect(editorStateFromEntry(noRecord("n"), ROSTER)).toEqual({
      attendance: {},
      report: "",
      staffNote: "",
    });
  });
});

describe("draftFromEditorState", () => {
  const base: SessionEditorState = {
    attendance: { a: "present", b: "present", c: "absent" },
    report: "  We finished the square.  ",
    staffNote: "  Watch Siiri.  ",
  };

  it("emits the past branch, trimmed, with the marks as they stand", () => {
    expect(draftFromEditorState(base, ROSTER)).toEqual({
      kind: "past",
      attendance: { a: "present", b: "present", c: "absent" },
      report: "We finished the square.",
      staffNote: "Watch Siiri.",
    });
  });

  it("emits a partial sheet unchanged rather than refusing it", () => {
    // It used to return null here and the gedu lost the marks they had made.
    // The unmarked rows stay unmarked — nothing is padded into an absence.
    expect(
      draftFromEditorState({ ...base, attendance: { a: "present" } }, ROSTER),
    ).toEqual({
      kind: "past",
      attendance: { a: "present" },
      report: "We finished the square.",
      staffNote: "Watch Siiri.",
    });
  });

  it("emits an empty map for a sheet nobody has touched", () => {
    expect(
      draftFromEditorState({ ...base, attendance: {} }, ROSTER),
    ).toMatchObject({ attendance: {} });
  });

  it("drops marks for anyone no longer on the roster", () => {
    expect(
      draftFromEditorState(
        { ...base, attendance: { a: "present", departed: "present" } },
        ROSTER,
      ),
    ).toMatchObject({ attendance: { a: "present" } });
  });

  it("saves happily with no notes at all — they are the optional half", () => {
    expect(
      draftFromEditorState(
        { ...base, report: "  ", staffNote: "" },
        ROSTER,
      ),
    ).toEqual({
      kind: "past",
      attendance: { a: "present", b: "present", c: "absent" },
      report: "",
      staffNote: "",
    });
  });

});

describe("applyDraftToEntry", () => {
  it("turns an unmarked session into a finished one, keeping identity and schedule", () => {
    expect(
      applyDraftToEntry(past("g"), {
        kind: "past",
        attendance: ALL_MARKED,
        report: "Redstone week.",
        staffNote: "",
      }),
    ).toEqual({
      kind: "past",
      id: "g",
      startsAt: START,
      endsAt: END,
      // Carried through untouched: saving a session does not change whether it
      // was ever asked for.
      owed: true,
      // Untouched as well: saving a report is not sending one, and the stamp
      // is the database's to write.
      reportEmailedAt: null,
      report: "Redstone week.",
      // An emptied note collapses to null so its block stops rendering.
      staffNote: null,
      attendance: ALL_MARKED,
      // Carried through rather than rewritten: the stamp is the database's, so
      // a session saved locally stays unsigned until the row comes back.
      lastEditedBy: null,
    });
  });

  it("records attendance with no notes, and the entry goes on needing attention", () => {
    // Saving the register is allowed on its own — nothing here refuses a
    // half-done session — but it does not discharge the entry, because the
    // families still have nothing to read. The alert survives the save, which
    // is what brings the gedu back for the write-up.
    const saved = applyDraftToEntry(past("g"), {
      kind: "past",
      attendance: ALL_MARKED,
      report: "",
      staffNote: "",
    });
    expect(saved).toMatchObject({ report: null, staffNote: null });
    expect(entryNeedsAttention(saved, ROSTER)).toBe(true);
  });

  it("leaves the alert up when the save carries a report — it is unsent", () => {
    // Writing the report is two parts of three. What clears the alert is the
    // send, which happens after the save and stamps the row server-side.
    const saved = applyDraftToEntry(past("g"), {
      kind: "past",
      attendance: ALL_MARKED,
      report: "# Redstone week",
      staffNote: "",
    });
    expect(entryNeedsAttention(saved, ROSTER)).toBe(true);
  });

  it("carries an existing send through a later edit of the report", () => {
    // A gedu fixing a typo after the mail went out does not un-send it: the
    // stamp is the database's, this function has no idea what was sent, and
    // dropping it would offer a Send button on a session already emailed.
    const saved = applyDraftToEntry(sentPast("g"), {
      kind: "past",
      attendance: ALL_MARKED,
      report: "# Redstone week, corrected",
      staffNote: "",
    });
    expect(saved).toMatchObject({ reportEmailedAt: EMAILED_AT });
    expect(entryNeedsAttention(saved, ROSTER)).toBe(false);
  });

  it("keeps a partially-saved entry flagged", () => {
    const saved = applyDraftToEntry(past("g"), {
      kind: "past",
      attendance: { a: "present" },
      report: "Half a roster and then the fire alarm went.",
      staffNote: "",
    });
    expect(saved).toMatchObject({ attendance: { a: "present" } });
    expect(entryNeedsAttention(saved, ROSTER)).toBe(true);
  });

  /*
   * The carry-through, against somebody rather than against the default null.
   * The same session, rewritten by whoever is at the keyboard now, still names
   * the gedu the database last stamped it with — this function has no idea who
   * is saving and must not guess, and the real answer comes back with the
   * refetched row a moment later. Asserted on both editors' fold paths because
   * a rule that holds on one of them and not the other is the drift worth
   * catching.
   */
  it("keeps the existing editor on the folded entry", () => {
    const saved = applyDraftToEntry(
      past("g", { report: "Redstone week.", lastEditedBy: EDITOR }),
      {
        kind: "past",
        attendance: ALL_MARKED,
        report: "Redstone week, corrected.",
        staffNote: "",
      },
    );
    expect(saved).toMatchObject({
      report: "Redstone week, corrected.",
      lastEditedBy: EDITOR,
    });
  });

  it("leaves a pre-epoch gap unsigned, because nothing has stored it yet", () => {
    // The one place this function *does* write the field, and it writes the
    // honest answer: a gap has no stored row behind it, so there is no stamp to
    // carry — the entry it becomes is unsigned until the write comes back.
    const saved = applyDraftToEntry(noRecord("n"), {
      kind: "past",
      attendance: ALL_MARKED,
      report: "# From memory",
      staffNote: "",
    });
    // Unsent for the same reason it is unsigned: a gap has no stored row, so
    // there is nothing behind it that could have been emailed.
    expect(saved).toMatchObject({
      kind: "past",
      lastEditedBy: null,
      reportEmailedAt: null,
    });
  });

  it("round-trips a finished entry through the editor without losing anything", () => {
    const entry = past("r", {
      report: "Redstone week.",
      staffNote: "Watch Siiri.",
      attendance: ALL_MARKED,
    });
    const draft = draftFromEditorState(
      editorStateFromEntry(entry, ROSTER),
      ROSTER,
    );
    expect(applyDraftToEntry(entry, draft)).toEqual(entry);
  });

  it("turns a pre-epoch gap into a past entry that owes nothing", () => {
    // The same transition the server-backed merge makes once the row exists:
    // it stops being a gap, and it carries `owed: false` forward so finishing
    // an old session can never turn it amber.
    const saved = applyDraftToEntry(noRecord("n"), {
      kind: "past",
      attendance: { a: "present" },
      report: "# From memory",
      staffNote: "",
    });
    expect(saved).toMatchObject({ kind: "past", owed: false });
    expect(entryNeedsAttention(saved, ROSTER)).toBe(false);
  });

  it("round-trips a partial entry through the editor without filling it in", () => {
    const entry = past("p", { attendance: { b: "absent" } });
    const draft = draftFromEditorState(
      editorStateFromEntry(entry, ROSTER),
      ROSTER,
    );
    expect(applyDraftToEntry(entry, draft)).toEqual(entry);
  });
});
