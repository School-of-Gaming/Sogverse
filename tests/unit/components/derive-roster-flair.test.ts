import { describe, it, expect } from "vitest";
import {
  deriveRosterFlairMaps,
  type RosterFlairSource,
} from "@/components/group-workspace/derive-roster-flair";

/**
 * ============================================================================
 * A group feed's roster becomes the workspace rail's per-member overlay.
 * ============================================================================
 *
 * Two shells make this turn — the gedu's workspace and the admin group details
 * page — which is why it is one function rather than two copies. Both of its
 * rules fail *silently* when they fail: a missed clubs gate badges every child
 * on a camp, and a null written into a map instead of left out reads as a
 * present value to every consumer downstream (the row's lit marker, the dialog's
 * seed, the badge's own window check). Neither shows up as an error, and neither
 * needs a React tree to test.
 *
 * The creations map has a third way to fail silently that the others do not: it
 * arrives as `[]` rather than as a null, so "left out" has to be decided on
 * *length*. Written in as an empty array, every member of every group would read
 * as having a creation, because the owed derivation reads the map's key set.
 */

/** Real generated UUIDs: the ids here are the same ones an identicon is drawn from. */
const IDS = {
  /** A note and a fresh stamp: the row wearing both marks. */
  siiri: "c4a9f0e2-8d31-4b7a-9f21-3e6d5c4b8a70",
  /** Neither mark, and still on the roster — most of a real group. */
  oskar: "2e7b6a54-3c1d-4f89-b0a2-7d8e9f0a1b2c",
  /** A stamp and no note. */
  emil: "8c5d4e3f-2a1b-4c9d-8e7f-6a5b4c3d2e1f",
} as const;

const JOINED_RECENTLY = "2026-03-06T12:00:00.000Z";
const STORED_NOTE = "Quiet in big groups — pair her rather than letting her pick.";

/** One roster row; the defaults are the common case, all absent. */
function member(
  participantId: string,
  flair: Partial<Omit<RosterFlairSource, "participant_id">> = {},
): RosterFlairSource {
  return {
    participant_id: participantId,
    group_joined_at: null,
    note: null,
    note_updated_by_first_name: null,
    // Never null on the wire: a list has a real empty value where a note does
    // not, so the RPC emits `[]` and this default says the same thing.
    creations: [],
    ...flair,
  };
}

/** Two creations, and the shape every list below is built from. */
const CASTLE = {
  title: "Lohikäärmeen linna",
  url: "https://www.planetminecraft.com/project/lohikaarmeen-linna/",
} as const;
const TOWER = {
  title: "Clock tower",
  url: "shared world: /warp aino-tower",
} as const;

const ROSTER: readonly RosterFlairSource[] = [
  member(IDS.siiri, {
    group_joined_at: JOINED_RECENTLY,
    note: STORED_NOTE,
    note_updated_by_first_name: "Sanna",
  }),
  // Creations and nothing else — deliberately not one of the two members
  // carrying a note, because the row's marker is lit by either and a roster
  // where the same people had both could never show that.
  member(IDS.oskar, { creations: [CASTLE, TOWER] }),
  member(IDS.emil, { group_joined_at: JOINED_RECENTLY }),
];

describe("deriveRosterFlairMaps — the clubs-only badge gate", () => {
  it("carries the join stamps when the badge is drawn", () => {
    const maps = deriveRosterFlairMaps(ROSTER, true);

    expect(maps.newcomers).toEqual({
      [IDS.siiri]: JOINED_RECENTLY,
      [IDS.emil]: JOINED_RECENTLY,
    });
  });

  it("hands over an empty newcomers map when it is not, and the notes untouched", () => {
    // The two marks are gated differently — a note is just as useful on a camp
    // — so the gate has to come apart here rather than at the row.
    const maps = deriveRosterFlairMaps(ROSTER, false);

    expect(maps.newcomers).toEqual({});
    expect(maps.notes).toEqual({ [IDS.siiri]: STORED_NOTE });
    expect(maps.noteEditors).toEqual({ [IDS.siiri]: "Sanna" });
  });
});

describe("deriveRosterFlairMaps — absence is how none is spelled", () => {
  it("leaves a null out of every map rather than writing it in", () => {
    const maps = deriveRosterFlairMaps(ROSTER, true);

    // `toEqual` treats a key holding undefined as absent, so the claim is made
    // against the key lists: a null written in as a value would pass the shape
    // assertions above and break every consumer, which reads a missing key as
    // the answer.
    expect(Object.keys(maps.newcomers)).toEqual([IDS.siiri, IDS.emil]);
    expect(Object.keys(maps.notes)).toEqual([IDS.siiri]);
    expect(Object.keys(maps.noteEditors)).toEqual([IDS.siiri]);
    expect(Object.keys(maps.creations)).toEqual([IDS.oskar]);
  });

  it("keeps a note whose last editor is gone", () => {
    // `updated_by` is ON DELETE SET NULL: a departed gedu's account must not
    // take the note with it. The note stands; only the editor line goes.
    const maps = deriveRosterFlairMaps(
      [member(IDS.siiri, { note: STORED_NOTE })],
      true,
    );

    expect(maps.notes).toEqual({ [IDS.siiri]: STORED_NOTE });
    expect(Object.keys(maps.noteEditors)).toEqual([]);
  });

  it("answers four empty maps for an empty roster", () => {
    expect(deriveRosterFlairMaps([], true)).toEqual({
      newcomers: {},
      notes: {},
      noteEditors: {},
      creations: {},
    });
  });
});

describe("deriveRosterFlairMaps — creations", () => {
  it("carries a member's list in the order it arrived", () => {
    // Array order *is* display order — there is no position column and no
    // reorder affordance — so a map that re-sorted or de-duplicated would be
    // rearranging somebody's work.
    const maps = deriveRosterFlairMaps(ROSTER, true);

    expect(maps.creations[IDS.oskar]).toEqual([CASTLE, TOWER]);
  });

  it("leaves an empty list out rather than writing it in", () => {
    // The RPC emits `[]` where a note is null, and this is where the two
    // absences are made to mean the same thing. Written in, every member of
    // every group would have a key — and the key set is exactly what the owed
    // derivation reads as "who has a creation".
    const maps = deriveRosterFlairMaps(
      [
        member(IDS.siiri, { creations: [] }),
        member(IDS.oskar, { creations: [CASTLE] }),
      ],
      true,
    );

    expect(Object.keys(maps.creations)).toEqual([IDS.oskar]);
    expect(maps.creations[IDS.siiri]).toBeUndefined();
  });

  it("is untouched by the clubs-only gate", () => {
    // The gate is the newcomer badge's alone. A creation is as real on a camp as
    // in a club — and the requirement that made creations owed work in the first
    // place lands on short runs.
    const maps = deriveRosterFlairMaps(ROSTER, false);

    expect(maps.newcomers).toEqual({});
    expect(maps.creations[IDS.oskar]).toEqual([CASTLE, TOWER]);
  });
});
