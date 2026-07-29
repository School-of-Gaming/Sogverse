import { describe, it, expect } from "vitest";
import {
  applyDraftToEntry,
  attendanceCounts,
  countEntriesNeedingAttention,
  draftFromEditorState,
  editorStateFromEntry,
  isEditableEntry,
} from "@/components/gedu/session-feed/entry-state";
import type {
  NeedsRecordSessionFeedEntry,
  NoRecordSessionFeedEntry,
  RecordedSessionFeedEntry,
  SessionEditorState,
  SessionFeedEntry,
  SessionFeedGamer,
  SkippedSessionFeedEntry,
  UpcomingSessionFeedEntry,
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
function upcoming(id: string): UpcomingSessionFeedEntry {
  return { kind: "upcoming", id, ...WHEN, voiceIsOpen: false, voiceHref: "#" };
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

  it("rejects the upcoming session and pre-epoch gaps", () => {
    expect(isEditableEntry(upcoming("u"))).toBe(false);
    expect(isEditableEntry(noRecord("n"))).toBe(false);
  });
});

describe("countEntriesNeedingAttention", () => {
  it("counts only the post-epoch gaps", () => {
    const entries: SessionFeedEntry[] = [
      upcoming("u"),
      needsRecord("g1"),
      needsRecord("g2"),
      noRecord("n"),
      skipped("s", null),
    ];
    expect(countEntriesNeedingAttention(entries)).toBe(2);
  });

  it("is zero for an empty feed", () => {
    expect(countEntriesNeedingAttention([])).toBe(0);
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
