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
  entryNeedsAttention,
  isEditableEntry,
  isPlannableEntry,
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
  SkippedSessionFeedEntry,
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
    publicNote: null,
    staffNote: null,
    attendance: {},
    ...fields,
  };
}
function skipped(id: string, reason: string | null): SkippedSessionFeedEntry {
  return { kind: "skipped", id, ...WHEN, reason };
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
    publicNote: null,
    staffNote: null,
    ...fields,
  };
}

describe("isEditableEntry", () => {
  it("accepts the two past states that can still be edited", () => {
    expect(isEditableEntry(past("r", { attendance: ALL_MARKED }))).toBe(true);
    expect(isEditableEntry(past("g"))).toBe(true);
    expect(isEditableEntry(skipped("s", null))).toBe(true);
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
      skipped("s", null),
      past("g"),
      noRecord("n"),
    ];
    for (const entry of entries) {
      expect(isEditableEntry(entry) && isPlannableEntry(entry)).toBe(false);
    }
  });
});

describe("entryNeedsAttention", () => {
  it("is exactly: past, not skipped, some of the roster still unmarked", () => {
    expect(entryNeedsAttention(past("g"), ROSTER)).toBe(true);
    expect(entryNeedsAttention(past("r", { attendance: ALL_MARKED }), ROSTER)).toBe(
      false,
    );
    expect(entryNeedsAttention(skipped("s", null), ROSTER)).toBe(false);
    expect(entryNeedsAttention(noRecord("n"), ROSTER)).toBe(false);
    expect(entryNeedsAttention(future("f"), ROSTER)).toBe(false);
  });

  it("still flags a session that has both notes but no attendance", () => {
    // Attendance is the mandatory half — it doubles as the ran-confirmation the
    // gedu is paid on — so a full write-up does not discharge the obligation.
    // The entry renders its notes *and* its alert.
    expect(
      entryNeedsAttention(
        past("g", { publicNote: "Redstone week.", staffNote: "Watch Siiri." }),
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
      past("g2", { publicNote: "Notes but no attendance." }),
      past("g3", { attendance: { a: "present" } }),
      past("r", { attendance: ALL_MARKED }),
      noRecord("n"),
      skipped("s", null),
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
      publicNote: "",
      staffNote: "",
    });
  });

  it("seeds from existing notes, mapping nulls to empty strings", () => {
    expect(
      planEditorStateFromEntry(
        future("f", {
          publicNote: "Redstone follow-up.",
          staffNote: "Charge the laptop.",
        }),
      ),
    ).toEqual({
      publicNote: "Redstone follow-up.",
      staffNote: "Charge the laptop.",
    });
  });

  it("trims both notes on the way out", () => {
    expect(
      planDraftFromEditorState({
        publicNote: "  Harbour road.  ",
        staffNote: "  Pair Siiri with Aino.  ",
      }),
    ).toEqual({
      kind: "plan",
      publicNote: "Harbour road.",
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
        publicNote: "Lighthouse week.",
        staffNote: "Bring the spare mouse.",
      }),
    ).toEqual({
      kind: "future",
      id: "f",
      startsAt: START,
      endsAt: END,
      publicNote: "Lighthouse week.",
      staffNote: "Bring the spare mouse.",
    });
  });

  it("collapses cleared notes to null so their blocks stop rendering", () => {
    const entry = future("f", { publicNote: "old", staffNote: "old" });
    expect(
      applyPlanDraftToEntry(entry, {
        kind: "plan",
        publicNote: "",
        staffNote: "",
      }),
    ).toMatchObject({ publicNote: null, staffNote: null });
  });

  it("round-trips notes through the editor without losing anything", () => {
    const entry = future("f", {
      publicNote: "Lighthouse week.",
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
      didNotRun: false,
      attendance: {},
      publicNote: "",
      staffNote: "",
      skipReason: "",
    });
  });

  it("keeps an unmarked session's existing notes when it opens", () => {
    const state = editorStateFromEntry(
      past("g", { publicNote: "Redstone week.", staffNote: "Watch Siiri." }),
      ROSTER,
    );
    expect(state.publicNote).toBe("Redstone week.");
    expect(state.staffNote).toBe("Watch Siiri.");
    expect(state.attendance).toEqual({});
  });

  it("reopens a finished session showing exactly what was saved", () => {
    expect(
      editorStateFromEntry(
        past("r", {
          publicNote: "We built a clock tower.",
          attendance: ALL_MARKED,
        }),
        ROSTER,
      ),
    ).toEqual({
      didNotRun: false,
      attendance: { a: "present", b: "absent", c: "present" },
      publicNote: "We built a clock tower.",
      staffNote: "",
      skipReason: "",
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

  it("opens a skipped session with the didn't-run branch already on", () => {
    const state = editorStateFromEntry(skipped("s", "Winter break"), ROSTER);
    expect(state.didNotRun).toBe(true);
    expect(state.skipReason).toBe("Winter break");
    expect(state.attendance).toEqual({});
  });
});

describe("draftFromEditorState", () => {
  const base: SessionEditorState = {
    didNotRun: false,
    attendance: { a: "present", b: "present", c: "absent" },
    publicNote: "  We finished the square.  ",
    staffNote: "  Watch Siiri.  ",
    skipReason: "  Winter break  ",
  };

  it("emits the past branch, trimmed, with the marks as they stand", () => {
    expect(draftFromEditorState(base, ROSTER)).toEqual({
      kind: "past",
      attendance: { a: "present", b: "present", c: "absent" },
      publicNote: "We finished the square.",
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
      publicNote: "We finished the square.",
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
        { ...base, publicNote: "  ", staffNote: "" },
        ROSTER,
      ),
    ).toEqual({
      kind: "past",
      attendance: { a: "present", b: "present", c: "absent" },
      publicNote: "",
      staffNote: "",
    });
  });

  it("emits the skipped branch without asking for attendance at all", () => {
    expect(
      draftFromEditorState(
        { ...base, didNotRun: true, attendance: {} },
        ROSTER,
      ),
    ).toEqual({ kind: "skipped", reason: "Winter break" });
  });
});

describe("applyDraftToEntry", () => {
  it("turns an unmarked session into a finished one, keeping identity and schedule", () => {
    expect(
      applyDraftToEntry(past("g"), {
        kind: "past",
        attendance: ALL_MARKED,
        publicNote: "Redstone week.",
        staffNote: "",
      }),
    ).toEqual({
      kind: "past",
      id: "g",
      startsAt: START,
      endsAt: END,
      publicNote: "Redstone week.",
      // An emptied note collapses to null so its block stops rendering.
      staffNote: null,
      attendance: ALL_MARKED,
    });
  });

  it("records attendance with no notes, and the entry stops needing attention", () => {
    const saved = applyDraftToEntry(past("g"), {
      kind: "past",
      attendance: ALL_MARKED,
      publicNote: "",
      staffNote: "",
    });
    expect(saved).toMatchObject({ publicNote: null, staffNote: null });
    expect(entryNeedsAttention(saved, ROSTER)).toBe(false);
  });

  it("keeps a partially-saved entry flagged", () => {
    const saved = applyDraftToEntry(past("g"), {
      kind: "past",
      attendance: { a: "present" },
      publicNote: "Half a roster and then the fire alarm went.",
      staffNote: "",
    });
    expect(saved).toMatchObject({ attendance: { a: "present" } });
    expect(entryNeedsAttention(saved, ROSTER)).toBe(true);
  });

  it("turns a finished entry into a skipped one", () => {
    const entry = past("r", {
      publicNote: "Redstone week.",
      staffNote: "Watch Siiri.",
      attendance: ALL_MARKED,
    });
    expect(applyDraftToEntry(entry, { kind: "skipped", reason: "" })).toEqual({
      kind: "skipped",
      id: "r",
      startsAt: START,
      endsAt: END,
      // No typed reason falls back to the generic display line.
      reason: null,
    });
  });

  it("round-trips a finished entry through the editor without losing anything", () => {
    const entry = past("r", {
      publicNote: "Redstone week.",
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
