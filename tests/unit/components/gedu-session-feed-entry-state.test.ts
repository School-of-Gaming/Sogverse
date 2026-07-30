import { describe, it, expect } from "vitest";
import {
  FEED_INITIAL_PAST_ENTRIES,
  FEED_PAST_CHUNK_SIZE,
  applyDraftToEntry,
  applyPlanDraftToEntry,
  attendanceCounts,
  countEntriesNeedingAttention,
  countSubstituteRequests,
  draftFromEditorState,
  editorStateFromEntry,
  isEditableEntry,
  isPlannableEntry,
  partitionFeedEntries,
  pastEntryWindow,
  planDraftFromEditorState,
  planEditorStateFromEntry,
} from "@/components/gedu/session-feed/entry-state";
import type {
  FutureSessionFeedEntry,
  NeedsRecordSessionFeedEntry,
  NoRecordSessionFeedEntry,
  RecordedSessionFeedEntry,
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

function recorded(
  id: string,
  fields: Omit<RecordedSessionFeedEntry, "kind" | "id" | "startsAt" | "endsAt">,
): RecordedSessionFeedEntry {
  return { kind: "recorded", id, ...WHEN, ...fields };
}
function skipped(id: string, reason: string | null): SkippedSessionFeedEntry {
  return { kind: "skipped", id, ...WHEN, reason };
}
function needsRecord(id: string): NeedsRecordSessionFeedEntry {
  return { kind: "needs_record", id, ...WHEN };
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
    needsSubstitute: false,
    voiceIsOpen: false,
    voiceHref: "#",
    ...fields,
  };
}

describe("isEditableEntry", () => {
  it("accepts the three states that can still be written up", () => {
    expect(
      isEditableEntry(
        recorded("r", { publicNote: "x", staffNote: null, presentGamerIds: [] }),
      ),
    ).toBe(true);
    expect(isEditableEntry(skipped("s", null))).toBe(true);
    expect(isEditableEntry(needsRecord("g"))).toBe(true);
  });

  it("rejects future sessions and pre-epoch gaps", () => {
    expect(isEditableEntry(future("u"))).toBe(false);
    expect(isEditableEntry(noRecord("n"))).toBe(false);
  });
});

describe("isPlannableEntry", () => {
  it("accepts only future sessions", () => {
    expect(isPlannableEntry(future("u"))).toBe(true);
    expect(isPlannableEntry(needsRecord("g"))).toBe(false);
    expect(isPlannableEntry(noRecord("n"))).toBe(false);
    expect(
      isPlannableEntry(
        recorded("r", { publicNote: "x", staffNote: null, presentGamerIds: [] }),
      ),
    ).toBe(false);
  });

  it("never overlaps with the write-up editor's set", () => {
    const entries: SessionFeedEntry[] = [
      future("u"),
      recorded("r", { publicNote: "", staffNote: null, presentGamerIds: [] }),
      skipped("s", null),
      needsRecord("g"),
      noRecord("n"),
    ];
    for (const entry of entries) {
      expect(isEditableEntry(entry) && isPlannableEntry(entry)).toBe(false);
    }
  });
});

describe("countEntriesNeedingAttention", () => {
  it("counts only the post-epoch gaps", () => {
    const entries: SessionFeedEntry[] = [
      future("u"),
      needsRecord("g1"),
      needsRecord("g2"),
      noRecord("n"),
      skipped("s", null),
    ];
    expect(countEntriesNeedingAttention(entries)).toBe(2);
  });

  it("ignores substitute requests — they are a message, not owed work", () => {
    // This is what keeps the dashboard badge meaning one thing: "write-ups you
    // owe", never "write-ups plus favours you asked for".
    const entries: SessionFeedEntry[] = [
      future("f1", { needsSubstitute: true }),
      future("f2", { needsSubstitute: true }),
      needsRecord("g1"),
    ];
    expect(countEntriesNeedingAttention(entries)).toBe(1);
  });

  it("is zero for an empty feed", () => {
    expect(countEntriesNeedingAttention([])).toBe(0);
  });
});

describe("countSubstituteRequests", () => {
  it("counts flagged future sessions only", () => {
    const entries: SessionFeedEntry[] = [
      future("f1", { needsSubstitute: true }),
      future("f2"),
      future("f3", { needsSubstitute: true }),
      needsRecord("g"),
    ];
    expect(countSubstituteRequests(entries)).toBe(2);
    expect(countSubstituteRequests([])).toBe(0);
  });
});

describe("partitionFeedEntries", () => {
  it("reads the next session off position — the last of the leading future run", () => {
    const entries: SessionFeedEntry[] = [
      future("f3"),
      future("f2"),
      future("f1"),
      recorded("p1", { publicNote: "", staffNote: null, presentGamerIds: [] }),
      noRecord("p2"),
    ];
    const { laterFuture, nextSession, past } = partitionFeedEntries(entries);
    expect(laterFuture.map((e) => e.id)).toEqual(["f3", "f2"]);
    expect(nextSession?.id).toBe("f1");
    expect(past.map((e) => e.id)).toEqual(["p1", "p2"]);
  });

  it("has no later block when only one session is ahead", () => {
    const { laterFuture, nextSession, past } = partitionFeedEntries([
      future("f1"),
      needsRecord("p1"),
    ]);
    expect(laterFuture).toEqual([]);
    expect(nextSession?.id).toBe("f1");
    expect(past.map((e) => e.id)).toEqual(["p1"]);
  });

  it("returns no next session for a feed whose schedule has run out", () => {
    const { laterFuture, nextSession, past } = partitionFeedEntries([
      needsRecord("p1"),
      noRecord("p2"),
    ]);
    expect(laterFuture).toEqual([]);
    expect(nextSession).toBeNull();
    expect(past).toHaveLength(2);
  });

  it("leaves a stray out-of-order future entry in the past block", () => {
    // The feed sorts nothing, so a caller's ordering bug must render in the
    // order it was given rather than being silently reshuffled.
    const { laterFuture, nextSession, past } = partitionFeedEntries([
      future("f1"),
      needsRecord("p1"),
      future("stray"),
    ]);
    expect(laterFuture).toEqual([]);
    expect(nextSession?.id).toBe("f1");
    expect(past.map((e) => e.id)).toEqual(["p1", "stray"]);
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
  it("seeds an unplanned session with empty fields and no request", () => {
    expect(planEditorStateFromEntry(future("f"))).toEqual({
      publicNote: "",
      staffNote: "",
      needsSubstitute: false,
    });
  });

  it("seeds from an existing plan, mapping nulls to empty strings", () => {
    expect(
      planEditorStateFromEntry(
        future("f", {
          publicNote: "Redstone follow-up.",
          staffNote: "Charge the laptop.",
          needsSubstitute: true,
        }),
      ),
    ).toEqual({
      publicNote: "Redstone follow-up.",
      staffNote: "Charge the laptop.",
      needsSubstitute: true,
    });
  });

  it("trims both notes on the way out and keeps the flag", () => {
    expect(
      planDraftFromEditorState({
        publicNote: "  Harbour road.  ",
        staffNote: "  Pair Siiri with Aino.  ",
        needsSubstitute: true,
      }),
    ).toEqual({
      kind: "plan",
      publicNote: "Harbour road.",
      staffNote: "Pair Siiri with Aino.",
      needsSubstitute: true,
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
        needsSubstitute: true,
      }),
    ).toEqual({
      kind: "future",
      id: "f",
      startsAt: START,
      endsAt: END,
      publicNote: "Lighthouse week.",
      staffNote: "Bring the spare mouse.",
      needsSubstitute: true,
      voiceIsOpen: true,
      voiceHref: "/voice/x",
    });
  });

  it("collapses cleared notes to null so their blocks stop rendering", () => {
    const entry = future("f", {
      publicNote: "old",
      staffNote: "old",
      needsSubstitute: true,
    });
    expect(
      applyPlanDraftToEntry(entry, {
        kind: "plan",
        publicNote: "",
        staffNote: "",
        needsSubstitute: false,
      }),
    ).toMatchObject({
      publicNote: null,
      staffNote: null,
      needsSubstitute: false,
    });
  });

  it("round-trips a plan through the editor without losing anything", () => {
    const entry = future("f", {
      publicNote: "Lighthouse week.",
      staffNote: "Bring the spare mouse.",
      needsSubstitute: true,
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

describe("editorStateFromEntry", () => {
  it("seeds a never-recorded session with everyone present", () => {
    expect(editorStateFromEntry(needsRecord("g"), ROSTER)).toEqual({
      didNotRun: false,
      presentGamerIds: ["a", "b", "c"],
      publicNote: "",
      staffNote: "",
      skipReason: "",
    });
  });

  it("seeds from an existing write-up, mapping a null staff note to empty", () => {
    expect(
      editorStateFromEntry(
        recorded("r", {
          publicNote: "We built a clock tower.",
          staffNote: null,
          presentGamerIds: ["a"],
        }),
        ROSTER,
      ),
    ).toEqual({
      didNotRun: false,
      presentGamerIds: ["a"],
      publicNote: "We built a clock tower.",
      staffNote: "",
      skipReason: "",
    });
  });

  it("opens a skipped session with the didn't-run branch already on", () => {
    const state = editorStateFromEntry(skipped("s", "Winter break"), ROSTER);
    expect(state.didNotRun).toBe(true);
    expect(state.skipReason).toBe("Winter break");
  });

  it("copies the present list rather than aliasing it", () => {
    const source = recorded("r", {
      publicNote: "",
      staffNote: null,
      presentGamerIds: ["a"],
    });
    const state = editorStateFromEntry(source, ROSTER);
    state.presentGamerIds.push("b");
    expect(source.presentGamerIds).toEqual(["a"]);
  });
});

describe("draftFromEditorState", () => {
  const base: SessionEditorState = {
    didNotRun: false,
    presentGamerIds: ["a", "b"],
    publicNote: "  We finished the square.  ",
    staffNote: "  Watch Siiri.  ",
    skipReason: "  Winter break  ",
  };

  it("emits the recorded branch, trimmed, when the session ran", () => {
    expect(draftFromEditorState(base)).toEqual({
      kind: "recorded",
      presentGamerIds: ["a", "b"],
      publicNote: "We finished the square.",
      staffNote: "Watch Siiri.",
    });
  });

  it("emits the skipped branch and drops the unsent note fields", () => {
    expect(draftFromEditorState({ ...base, didNotRun: true })).toEqual({
      kind: "skipped",
      reason: "Winter break",
    });
  });
});

describe("applyDraftToEntry", () => {
  it("turns a gap into a written-up entry, keeping its identity and schedule", () => {
    const gap = needsRecord("g");
    expect(
      applyDraftToEntry(gap, {
        kind: "recorded",
        presentGamerIds: ["a"],
        publicNote: "Redstone week.",
        staffNote: "",
      }),
    ).toEqual({
      kind: "recorded",
      id: "g",
      startsAt: START,
      endsAt: END,
      publicNote: "Redstone week.",
      // An emptied staff note collapses to null so its block stops rendering.
      staffNote: null,
      presentGamerIds: ["a"],
    });
  });

  it("turns a written-up entry into a skipped one", () => {
    const entry = recorded("r", {
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

  it("round-trips an edit through the editor without losing anything", () => {
    const entry = recorded("r", {
      publicNote: "Redstone week.",
      staffNote: "Watch Siiri.",
      presentGamerIds: ["a", "b"],
    });
    expect(
      applyDraftToEntry(
        entry,
        draftFromEditorState(editorStateFromEntry(entry, ROSTER)),
      ),
    ).toEqual(entry);
  });
});
