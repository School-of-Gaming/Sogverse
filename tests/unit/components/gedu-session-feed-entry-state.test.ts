import { describe, it, expect } from "vitest";
import {
  FEED_INITIAL_PAST_ENTRIES,
  FEED_PAST_CHUNK_SIZE,
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
  newestPastEntryId,
  partitionFeedEntries,
  pastEntryWindow,
  planDraftFromEditorState,
  planEditorStateFromEntry,
  rosterScopedMarks,
} from "@/components/gedu/session-feed/entry-state";
import type {
  FutureSessionFeedEntry,
  NoRecordSessionFeedEntry,
  PastSessionFeedEntry,
  SessionEditorState,
  SessionFeedEntry,
  SessionFeedGamer,
} from "@/components/gedu/session-feed/types";

const ROSTER: SessionFeedGamer[] = [
  { id: "a", firstName: "Aino" },
  { id: "b", firstName: "Väinö" },
  { id: "c", firstName: "Elias" },
];

/** Every roster member answered — the only shape that clears the alert. */
const ALL_MARKED = { a: "present", b: "absent", c: "present" } as const;

const START = new Date("2026-03-02T14:30:00.000Z");
const END = new Date("2026-03-02T16:00:00.000Z");
const WHEN = { startsAt: START, endsAt: END };

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
    ...fields,
  };
}
function noRecord(id: string): NoRecordSessionFeedEntry {
  return { kind: "no_record", id, ...WHEN };
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
    ...fields,
  };
}

describe("isEditableEntry", () => {
  it("accepts a past session whether or not anything is recorded on it", () => {
    expect(isEditableEntry(past("r", { attendance: ALL_MARKED }))).toBe(true);
    expect(isEditableEntry(past("g"))).toBe(true);
  });

  it("rejects future sessions and pre-epoch gaps", () => {
    expect(isEditableEntry(future("u"))).toBe(false);
    expect(isEditableEntry(noRecord("n"))).toBe(false);
  });
});

describe("isPlannableEntry", () => {
  it("accepts only future sessions", () => {
    expect(isPlannableEntry(future("u"))).toBe(true);
    expect(isPlannableEntry(past("g"))).toBe(false);
    expect(isPlannableEntry(noRecord("n"))).toBe(false);
  });

  it("never overlaps with the record editor's set", () => {
    const entries: SessionFeedEntry[] = [
      future("u"),
      past("r", { attendance: ALL_MARKED }),
      past("g"),
      noRecord("n"),
    ];
    for (const entry of entries) {
      expect(isEditableEntry(entry) && isPlannableEntry(entry)).toBe(false);
    }
  });
});

/**
 * The three-rung ladder. Its whole reason to exist is the middle rung: a report
 * is optional, so its absence must never read as work owed — but a session that
 * *has* one has to be distinguishable from one that has not, or there is nothing
 * to aim at. Hence neutral in the middle and a green check on top.
 */
describe("entryCompleteness", () => {
  it("climbs from unmarked, through marked, to marked-and-reported", () => {
    expect(entryCompleteness(past("a"), ROSTER)).toBe("needs_attention");
    expect(
      entryCompleteness(past("b", { attendance: ALL_MARKED }), ROSTER),
    ).toBe("recorded");
    expect(
      entryCompleteness(
        past("c", { attendance: ALL_MARKED, report: "# Redstone week" }),
        ROSTER,
      ),
    ).toBe("complete");
  });

  it("needs BOTH halves for the top rung", () => {
    // A report with the roster unfinished is still outstanding work — the
    // report never buys off the attendance.
    expect(
      entryCompleteness(past("d", { report: "# Redstone week" }), ROSTER),
    ).toBe("needs_attention");
  });

  it("treats a gedu note as no part of the ladder", () => {
    // The gedu note is a message to a colleague; families never see it, so it
    // cannot be what makes a session complete for them.
    expect(
      entryCompleteness(
        past("e", { attendance: ALL_MARKED, staffNote: "Watch Siiri." }),
        ROSTER,
      ),
    ).toBe("recorded");
  });

  it("counts an empty-string report as no report", () => {
    // A cleared editor saves as `""` before it collapses to null; the ladder
    // must not read that as a written report on the way through.
    expect(
      entryCompleteness(
        past("f", { attendance: ALL_MARKED, report: "" }),
        ROSTER,
      ),
    ).toBe("recorded");
  });

  it("exempts future and pre-epoch entries entirely", () => {
    expect(entryCompleteness(future("u"), ROSTER)).toBeNull();
    expect(entryCompleteness(noRecord("n"), ROSTER)).toBeNull();
  });

  it("reopens when a child joins the group after the sheet was finished", () => {
    // Measured against the *current* roster, never the stored map's keys —
    // nobody has yet said whether the new child was there.
    const entry = past("g", { attendance: ALL_MARKED, report: "# Week" });
    expect(entryCompleteness(entry, ROSTER)).toBe("complete");
    expect(
      entryCompleteness(entry, [...ROSTER, { id: "d", firstName: "Linnéa" }]),
    ).toBe("needs_attention");
  });
});

describe("entryIsComplete", () => {
  it("is the top rung and nothing else", () => {
    expect(
      entryIsComplete(
        past("a", { attendance: ALL_MARKED, report: "# Week" }),
        ROSTER,
      ),
    ).toBe(true);
    expect(entryIsComplete(past("b", { attendance: ALL_MARKED }), ROSTER)).toBe(
      false,
    );
    expect(entryIsComplete(past("c"), ROSTER)).toBe(false);
  });

  it("is never true at the same time as needing attention", () => {
    const entries: SessionFeedEntry[] = [
      past("a"),
      past("b", { attendance: ALL_MARKED }),
      past("c", { attendance: ALL_MARKED, report: "# Week" }),
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
  it("is exactly: a past session with some of the roster still unmarked", () => {
    expect(entryNeedsAttention(past("g"), ROSTER)).toBe(true);
    expect(entryNeedsAttention(past("r", { attendance: ALL_MARKED }), ROSTER)).toBe(
      false,
    );
    expect(entryNeedsAttention(noRecord("n"), ROSTER)).toBe(false);
    expect(entryNeedsAttention(future("f"), ROSTER)).toBe(false);
  });

  it("still flags a session that has both notes but no attendance", () => {
    // Attendance is the mandatory half — it doubles as the ran-confirmation the
    // gedu is paid on — so a full write-up does not discharge the obligation.
    // The entry renders its notes *and* its alert.
    expect(
      entryNeedsAttention(
        past("g", { report: "Redstone week.", staffNote: "Watch Siiri." }),
        ROSTER,
      ),
    ).toBe(true);
  });

  it("does not flag a fully-marked session that has no notes at all", () => {
    // The other half of the same rule: notes are optional, so their absence is
    // never work owed.
    expect(
      entryNeedsAttention(past("r", { attendance: ALL_MARKED }), ROSTER),
    ).toBe(false);
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

  it("treats an all-absent record as finished, not as unrecorded", () => {
    // "Everybody was away" is a real claim, and marking every row absent is how
    // it is made — nothing like a sheet nobody has touched.
    expect(
      entryNeedsAttention(
        past("r", { attendance: { a: "absent", b: "absent", c: "absent" } }),
        ROSTER,
      ),
    ).toBe(false);
  });

  it("reopens when a child joins the group after the session was marked", () => {
    // Measured against the *current* roster: nobody has said whether the new
    // child was there, so the honest answer is that the sheet is unfinished.
    const entry = past("r", { attendance: ALL_MARKED });
    const grown = [...ROSTER, { id: "d", firstName: "Linnéa" }];
    expect(entryNeedsAttention(entry, ROSTER)).toBe(false);
    expect(entryNeedsAttention(entry, grown)).toBe(true);
  });

  it("never flags anything against an empty roster", () => {
    expect(entryNeedsAttention(past("g"), [])).toBe(false);
  });
});

describe("countEntriesNeedingAttention", () => {
  it("counts the past entries whose roster is not finished", () => {
    const entries: SessionFeedEntry[] = [
      future("u"),
      past("g1"),
      past("g2", { report: "Notes but no attendance." }),
      past("g3", { attendance: { a: "present" } }),
      past("r", { attendance: ALL_MARKED }),
      noRecord("n"),
    ];
    expect(countEntriesNeedingAttention(entries, ROSTER)).toBe(3);
  });

  it("is zero for an empty feed", () => {
    expect(countEntriesNeedingAttention([], ROSTER)).toBe(0);
  });
});

describe("partitionFeedEntries", () => {
  it("reads the next session off position — the last of the leading future run", () => {
    const entries: SessionFeedEntry[] = [
      future("f3"),
      future("f2"),
      future("f1"),
      past("p1", { attendance: ALL_MARKED }),
      noRecord("p2"),
    ];
    const { laterFuture, nextSession, past: pastRows } =
      partitionFeedEntries(entries);
    expect(laterFuture.map((e) => e.id)).toEqual(["f3", "f2"]);
    expect(nextSession?.id).toBe("f1");
    expect(pastRows.map((e) => e.id)).toEqual(["p1", "p2"]);
  });

  it("has no later block when only one session is ahead", () => {
    const { laterFuture, nextSession, past: pastRows } = partitionFeedEntries([
      future("f1"),
      past("p1"),
    ]);
    expect(laterFuture).toEqual([]);
    expect(nextSession?.id).toBe("f1");
    expect(pastRows.map((e) => e.id)).toEqual(["p1"]);
  });

  it("returns no next session for a feed whose schedule has run out", () => {
    const { laterFuture, nextSession, past: pastRows } = partitionFeedEntries([
      past("p1"),
      noRecord("p2"),
    ]);
    expect(laterFuture).toEqual([]);
    expect(nextSession).toBeNull();
    expect(pastRows).toHaveLength(2);
  });

  it("leaves a stray out-of-order future entry in the past block", () => {
    // The feed sorts nothing, so a caller's ordering bug must render in the
    // order it was given rather than being silently reshuffled.
    const { laterFuture, nextSession, past: pastRows } = partitionFeedEntries([
      future("f1"),
      past("p1"),
      future("stray"),
    ]);
    expect(laterFuture).toEqual([]);
    expect(nextSession?.id).toBe("f1");
    expect(pastRows.map((e) => e.id)).toEqual(["p1", "stray"]);
  });

  it("is empty all round for an empty feed", () => {
    expect(partitionFeedEntries([])).toEqual({
      laterFuture: [],
      nextSession: null,
      past: [],
    });
  });
});

/**
 * The one report the feed renders in full. It is what the weekly loop opens the
 * page for — what happened last time — so it costs no click, and everything
 * older keeps its clamp so a term of write-ups never becomes a wall.
 *
 * The rule is **positional**, and that is the part worth pinning: nothing about
 * the report's own length or shape may enter into it, or two feeds that differ
 * only in how chatty last week's gedu was would behave differently.
 */
describe("newestPastEntryId", () => {
  it("names the first recorded session in the past run", () => {
    expect(
      newestPastEntryId([
        past("p1", { report: "# Last week" }),
        past("p2", { report: "# The week before" }),
      ]),
    ).toBe("p1");
  });

  it("names it whether or not it carries a report at all", () => {
    // Positional, not a question about the writing: a bare, unwritten newest
    // session is still the newest session.
    expect(newestPastEntryId([past("p1"), past("p2")])).toBe("p1");
  });

  it("steps over pre-epoch gaps, which recorded nothing", () => {
    expect(
      newestPastEntryId([noRecord("n1"), noRecord("n2"), past("p1")]),
    ).toBe("p1");
  });

  it("names nothing for a feed with no past at all", () => {
    expect(newestPastEntryId([])).toBeNull();
    expect(newestPastEntryId([noRecord("n1")])).toBeNull();
  });

  it("moves to the new top when an older chunk is revealed beneath it", () => {
    // The past grows downward as chunks are revealed, so the exemption must
    // stay pinned to the head of the run rather than to a fixed index.
    const head = past("p1", { report: "# Last week" });
    expect(newestPastEntryId([head])).toBe("p1");
    expect(newestPastEntryId([head, past("p2"), past("p3")])).toBe("p1");
  });
});

describe("pastEntryWindow", () => {
  it("opens on the recent slice and reports the rest as remaining", () => {
    const total = 55;
    expect(pastEntryWindow(total, 0)).toEqual({
      visible: FEED_INITIAL_PAST_ENTRIES,
      remaining: total - FEED_INITIAL_PAST_ENTRIES,
    });
  });

  it("reveals one chunk per click, cumulatively", () => {
    const total = 55;
    expect(pastEntryWindow(total, 1).visible).toBe(
      FEED_INITIAL_PAST_ENTRIES + FEED_PAST_CHUNK_SIZE,
    );
    expect(pastEntryWindow(total, 2).visible).toBe(
      FEED_INITIAL_PAST_ENTRIES + 2 * FEED_PAST_CHUNK_SIZE,
    );
  });

  it("never exceeds the total, and reaches zero remaining", () => {
    const total = 12;
    expect(pastEntryWindow(total, 1)).toEqual({ visible: 12, remaining: 0 });
    expect(pastEntryWindow(total, 99)).toEqual({ visible: 12, remaining: 0 });
  });

  it("hides the control for a term short enough to render whole", () => {
    expect(pastEntryWindow(FEED_INITIAL_PAST_ENTRIES, 0).remaining).toBe(0);
    expect(pastEntryWindow(3, 0)).toEqual({ visible: 3, remaining: 0 });
    expect(pastEntryWindow(0, 0)).toEqual({ visible: 0, remaining: 0 });
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
    });
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
      report: "Redstone week.",
      // An emptied note collapses to null so its block stops rendering.
      staffNote: null,
      attendance: ALL_MARKED,
    });
  });

  it("records attendance with no notes, and the entry stops needing attention", () => {
    const saved = applyDraftToEntry(past("g"), {
      kind: "past",
      attendance: ALL_MARKED,
      report: "",
      staffNote: "",
    });
    expect(saved).toMatchObject({ report: null, staffNote: null });
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

  it("round-trips a partial entry through the editor without filling it in", () => {
    const entry = past("p", { attendance: { b: "absent" } });
    const draft = draftFromEditorState(
      editorStateFromEntry(entry, ROSTER),
      ROSTER,
    );
    expect(applyDraftToEntry(entry, draft)).toEqual(entry);
  });
});
