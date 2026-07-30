import { describe, it, expect } from "vitest";
import {
  FEED_INITIAL_PAST_ENTRIES,
  FEED_PAST_CHUNK_SIZE,
  allPresentMarks,
  applyDraftToEntry,
  applyPlanDraftToEntry,
  attendanceCounts,
  attendanceMarksFromPresentIds,
  attendanceProgress,
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
    presentGamerIds: null,
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
    voiceIsOpen: false,
    voiceHref: "#",
    ...fields,
  };
}

describe("isEditableEntry", () => {
  it("accepts the two past states that can still be edited", () => {
    expect(isEditableEntry(past("r", { presentGamerIds: [] }))).toBe(true);
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

  it("never overlaps with the write-up editor's set", () => {
    const entries: SessionFeedEntry[] = [
      future("u"),
      past("r", { presentGamerIds: ["a"] }),
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
  it("is exactly: past, not skipped, attendance unrecorded", () => {
    expect(entryNeedsAttention(past("g"))).toBe(true);
    expect(entryNeedsAttention(past("r", { presentGamerIds: [] }))).toBe(false);
    expect(entryNeedsAttention(skipped("s", null))).toBe(false);
    expect(entryNeedsAttention(noRecord("n"))).toBe(false);
    expect(entryNeedsAttention(future("f"))).toBe(false);
  });

  it("still flags a session that has both notes but no attendance", () => {
    // Attendance is the mandatory half — it doubles as the ran-confirmation the
    // gedu is paid on — so a full write-up does not discharge the obligation.
    // The entry renders its notes *and* its alert.
    expect(
      entryNeedsAttention(
        past("g", { publicNote: "Redstone week.", staffNote: "Watch Siiri." }),
      ),
    ).toBe(true);
  });

  it("does not flag a recorded session that has no notes at all", () => {
    // The other half of the same rule: notes are optional, so their absence is
    // never work owed.
    expect(entryNeedsAttention(past("r", { presentGamerIds: ["a", "b"] }))).toBe(
      false,
    );
  });

  it("treats an all-absent record as recorded, not as unrecorded", () => {
    // The distinction the null exists for: "everybody was away" is a real
    // claim, and an empty present list is how it is stored.
    expect(entryNeedsAttention(past("r", { presentGamerIds: [] }))).toBe(false);
  });
});

describe("countEntriesNeedingAttention", () => {
  it("counts only the post-epoch past entries with no attendance", () => {
    const entries: SessionFeedEntry[] = [
      future("u"),
      past("g1"),
      past("g2", { publicNote: "Notes but no attendance." }),
      past("r", { presentGamerIds: ["a"] }),
      noRecord("n"),
      skipped("s", null),
    ];
    expect(countEntriesNeedingAttention(entries)).toBe(2);
  });

  it("is zero for an empty feed", () => {
    expect(countEntriesNeedingAttention([])).toBe(0);
  });
});

describe("partitionFeedEntries", () => {
  it("reads the next session off position — the last of the leading future run", () => {
    const entries: SessionFeedEntry[] = [
      future("f3"),
      future("f2"),
      future("f1"),
      past("p1", { presentGamerIds: [] }),
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
  it("seeds an unplanned session with empty fields", () => {
    expect(planEditorStateFromEntry(future("f"))).toEqual({
      publicNote: "",
      staffNote: "",
    });
  });

  it("seeds from an existing plan, mapping nulls to empty strings", () => {
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
  it("folds a plan back in, keeping identity, schedule and voice state", () => {
    const entry = future("f", { voiceIsOpen: true, voiceHref: "/voice/x" });
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
      voiceIsOpen: true,
      voiceHref: "/voice/x",
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

  it("round-trips a plan through the editor without losing anything", () => {
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

describe("attendanceCounts", () => {
  it("counts the roster members marked present", () => {
    expect(attendanceCounts(ROSTER, ["a", "c"])).toEqual({
      present: 2,
      total: 3,
    });
  });

  it("ignores ids that are no longer on the roster", () => {
    // A child who left the group after the session was recorded must not push
    // the headline past the roster size ("4 of 3 present").
    expect(attendanceCounts(ROSTER, ["a", "b", "c", "departed"])).toEqual({
      present: 3,
      total: 3,
    });
  });
});

describe("attendanceMarksFromPresentIds / allPresentMarks", () => {
  it("expands a stored present list into an explicit mark per roster member", () => {
    expect(attendanceMarksFromPresentIds(ROSTER, ["a", "c"])).toEqual({
      a: "present",
      b: "absent",
      c: "present",
    });
  });

  it("marks everybody present for the shortcut", () => {
    expect(allPresentMarks(ROSTER)).toEqual({
      a: "present",
      b: "present",
      c: "present",
    });
    expect(allPresentMarks([])).toEqual({});
  });
});

describe("attendanceProgress", () => {
  it("is incomplete while any roster member is unmarked", () => {
    expect(attendanceProgress(ROSTER, { a: "present" })).toEqual({
      marked: 1,
      total: 3,
      complete: false,
    });
  });

  it("is complete once every roster member carries a mark, present or absent", () => {
    expect(
      attendanceProgress(ROSTER, { a: "present", b: "absent", c: "absent" }),
    ).toEqual({ marked: 3, total: 3, complete: true });
  });

  it("counts over the roster, so a stale mark can't fake completeness", () => {
    // A child who left the group leaves a key behind; counting keys would make
    // a two-of-three sheet look finished.
    expect(
      attendanceProgress(ROSTER, { a: "present", b: "absent", departed: "present" }),
    ).toEqual({ marked: 2, total: 3, complete: false });
  });

  it("is trivially complete for an empty roster", () => {
    expect(attendanceProgress([], {})).toEqual({
      marked: 0,
      total: 0,
      complete: true,
    });
  });
});

describe("editorStateFromEntry", () => {
  it("opens an unrecorded session with every row unmarked", () => {
    // Never pre-ticked: a gedu must not be able to save a room they never
    // looked at, and "unmarked" is the state that makes Save refuse.
    expect(editorStateFromEntry(past("g"), ROSTER)).toEqual({
      didNotRun: false,
      attendance: {},
      publicNote: "",
      staffNote: "",
      skipReason: "",
    });
  });

  it("keeps an unrecorded session's existing notes when it opens", () => {
    const state = editorStateFromEntry(
      past("g", { publicNote: "Redstone week.", staffNote: "Watch Siiri." }),
      ROSTER,
    );
    expect(state.publicNote).toBe("Redstone week.");
    expect(state.staffNote).toBe("Watch Siiri.");
    expect(state.attendance).toEqual({});
  });

  it("reopens a recorded session showing exactly what was saved", () => {
    expect(
      editorStateFromEntry(
        past("r", {
          publicNote: "We built a clock tower.",
          presentGamerIds: ["a"],
        }),
        ROSTER,
      ),
    ).toEqual({
      didNotRun: false,
      attendance: { a: "present", b: "absent", c: "absent" },
      publicNote: "We built a clock tower.",
      staffNote: "",
      skipReason: "",
    });
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

  it("emits the past branch, trimmed, once every roster member is marked", () => {
    expect(draftFromEditorState(base, ROSTER)).toEqual({
      kind: "past",
      presentGamerIds: ["a", "b"],
      publicNote: "We finished the square.",
      staffNote: "Watch Siiri.",
    });
  });

  it("refuses to produce a draft while any roster member is unmarked", () => {
    // The floor under the disabled Save button: there is no path that turns
    // "nobody said" into a stored absence.
    expect(
      draftFromEditorState({ ...base, attendance: { a: "present" } }, ROSTER),
    ).toBeNull();
  });

  it("saves happily with no notes at all — they are the optional half", () => {
    expect(
      draftFromEditorState(
        { ...base, publicNote: "  ", staffNote: "" },
        ROSTER,
      ),
    ).toEqual({
      kind: "past",
      presentGamerIds: ["a", "b"],
      publicNote: "",
      staffNote: "",
    });
  });

  it("emits present ids in roster order, whatever order they were marked in", () => {
    const draft = draftFromEditorState(
      { ...base, attendance: { c: "present", a: "present", b: "present" } },
      ROSTER,
    );
    expect(draft).toMatchObject({ presentGamerIds: ["a", "b", "c"] });
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
  it("turns an unrecorded session into a recorded one, keeping identity and schedule", () => {
    expect(
      applyDraftToEntry(past("g"), {
        kind: "past",
        presentGamerIds: ["a"],
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
      presentGamerIds: ["a"],
    });
  });

  it("records attendance with no notes, and the entry stops needing attention", () => {
    const saved = applyDraftToEntry(past("g"), {
      kind: "past",
      presentGamerIds: ["a", "b", "c"],
      publicNote: "",
      staffNote: "",
    });
    expect(saved).toMatchObject({ publicNote: null, staffNote: null });
    expect(entryNeedsAttention(saved)).toBe(false);
  });

  it("turns a recorded entry into a skipped one", () => {
    const entry = past("r", {
      publicNote: "Redstone week.",
      staffNote: "Watch Siiri.",
      presentGamerIds: ["a", "b"],
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

  it("round-trips a recorded entry through the editor without losing anything", () => {
    const entry = past("r", {
      publicNote: "Redstone week.",
      staffNote: "Watch Siiri.",
      presentGamerIds: ["a", "b"],
    });
    const draft = draftFromEditorState(
      editorStateFromEntry(entry, ROSTER),
      ROSTER,
    );
    expect(draft).not.toBeNull();
    expect(applyDraftToEntry(entry, draft!)).toEqual(entry);
  });
});
