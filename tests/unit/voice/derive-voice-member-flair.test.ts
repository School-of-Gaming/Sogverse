import { describe, it, expect, vi } from "vitest";
import { deriveVoiceMemberFlair } from "@/components/voice/derive-voice-member-flair";
import type {
  GroupStaffOverlay,
  GroupStaffOverlayMember,
  ProductType,
} from "@/types";

/**
 * ============================================================================
 * The staff overlay becomes the voice room's flair context value.
 * ============================================================================
 *
 * This is the one place in the room's flair path with rules of its own, and
 * every one of them fails silently: a wrong seat-holder set puts a note button
 * on a Gedu's own row and the refusal arrives from the database; a missed clubs
 * gate badges a camp; a null written into a map instead of left out reads as a
 * present value to every consumer downstream. None of it shows up as an error,
 * and none of it needs a React tree to test.
 */

/** Real generated UUIDs — the ids the room merges on are `profiles.id`. */
const IDS = {
  /** A note and a fresh stamp: the row wearing both marks. */
  siiri: "36bd113c-5a2f-444c-8d5c-199a47164706",
  /** Neither mark, and still a seat holder — most of a real group. */
  oskar: "516dd311-5433-4da7-9020-4bb951657d8b",
  /** A stamp and no note. */
  emil: "882f2236-47fe-4ac3-854e-03de1103a84c",
  /** In the room, in nobody's seat: the Gedu running the session. */
  sanna: "afa4218c-d0fe-4d7f-8f2a-30a805832e2e",
} as const;

const NOW = new Date("2026-03-16T12:00:00.000Z");
const JOINED_RECENTLY = "2026-03-06T12:00:00.000Z";
const STORED_NOTE = "Quiet in big groups — pair her rather than letting her pick.";

/** One member's overlay record; the defaults are the common case, all absent. */
function member(
  flair: Partial<GroupStaffOverlayMember> = {},
): GroupStaffOverlayMember {
  return {
    group_joined_at: null,
    note: null,
    note_updated_by_first_name: null,
    // Never null on the wire: a list has a real empty value where a note does
    // not, so the RPC emits `[]` and this default says the same thing.
    creations: [],
    ...flair,
  };
}

function overlayFor(productType: ProductType | null): GroupStaffOverlay {
  return {
    product_type: productType,
    members: {
      [IDS.siiri]: member({
        group_joined_at: JOINED_RECENTLY,
        note: STORED_NOTE,
        note_updated_by_first_name: "Sanna",
      }),
      [IDS.oskar]: member(),
      [IDS.emil]: member({ group_joined_at: JOINED_RECENTLY }),
    },
  };
}

const openNote = vi.fn();

describe("deriveVoiceMemberFlair — the absent overlay", () => {
  it("is null for a viewer with no overlay, and for one still waiting", () => {
    // The room exactly as it rendered before any of this existed: what a
    // child's client gets (it never makes the read, and would be refused), and
    // what a staff client gets for the frame or two before the read lands.
    expect(deriveVoiceMemberFlair(null, NOW, openNote)).toBeNull();
    expect(deriveVoiceMemberFlair(undefined, NOW, openNote)).toBeNull();
  });
});

describe("deriveVoiceMemberFlair — the seat-holder set", () => {
  it("is the document's own keys, marks or no marks", () => {
    const flair = deriveVoiceMemberFlair(
      overlayFor("consumer_club"),
      NOW,
      openNote,
    );

    // Oskar has neither a note nor a stamp and is still a legal note target —
    // which is why the set cannot be derived from the sparse maps below.
    expect(flair?.members).toEqual(
      new Set([IDS.siiri, IDS.oskar, IDS.emil]),
    );
  });

  it("leaves out anyone the document does not name", () => {
    // A room is not a roster: the Gedu running the session holds no seat in the
    // group, so the write RPC would refuse a note about her. She is in the call
    // and not in this set, and the list gates her button on exactly that.
    const flair = deriveVoiceMemberFlair(
      overlayFor("consumer_club"),
      NOW,
      openNote,
    );

    expect(flair?.members.has(IDS.sanna)).toBe(false);
  });
});

describe("deriveVoiceMemberFlair — the clubs-only badge gate", () => {
  it.each<ProductType>(["consumer_club", "municipality_club"])(
    "carries the join stamps on a %s",
    (productType) => {
      const flair = deriveVoiceMemberFlair(
        overlayFor(productType),
        NOW,
        openNote,
      );

      expect(flair?.newcomers).toEqual({
        [IDS.siiri]: JOINED_RECENTLY,
        [IDS.emil]: JOINED_RECENTLY,
      });
    },
  );

  it.each<ProductType>(["camp", "event"])(
    "hands over an empty newcomers map on a %s, and the notes untouched",
    (productType) => {
      // The two marks are gated differently — a note is just as useful on a
      // camp — so the gate has to come apart here rather than at the row.
      const flair = deriveVoiceMemberFlair(
        overlayFor(productType),
        NOW,
        openNote,
      );

      expect(flair?.newcomers).toEqual({});
      expect(flair?.notes).toEqual({ [IDS.siiri]: STORED_NOTE });
    },
  );

  it("draws no badge when the document carries no product type", () => {
    // An unknown group answered to an admin comes back with a null product
    // type; "no type" is "no badge", never "assume a club".
    const flair = deriveVoiceMemberFlair(overlayFor(null), NOW, openNote);

    expect(flair?.newcomers).toEqual({});
    expect(flair?.notes).toEqual({ [IDS.siiri]: STORED_NOTE });
  });
});

describe("deriveVoiceMemberFlair — absence is how none is spelled", () => {
  it("leaves a null out of every map rather than writing it in", () => {
    const flair = deriveVoiceMemberFlair(
      overlayFor("consumer_club"),
      NOW,
      openNote,
    );

    // `toEqual` treats a key holding undefined as absent, so the claim is made
    // against the key lists: a null written in as a value would pass the
    // shape assertions above and break every consumer, which reads a missing
    // key as the answer.
    expect(Object.keys(flair?.newcomers ?? {})).toEqual([IDS.siiri, IDS.emil]);
    expect(Object.keys(flair?.notes ?? {})).toEqual([IDS.siiri]);
    expect(Object.keys(flair?.noteEditors ?? {})).toEqual([IDS.siiri]);
  });

  it("keeps a note whose last editor is gone", () => {
    // `updated_by` is ON DELETE SET NULL: a departed Gedu's account must not
    // take the note with it. The note stands; only the editor line goes.
    const flair = deriveVoiceMemberFlair(
      {
        product_type: "consumer_club",
        members: { [IDS.siiri]: member({ note: STORED_NOTE }) },
      },
      NOW,
      openNote,
    );

    expect(flair?.notes).toEqual({ [IDS.siiri]: STORED_NOTE });
    expect(Object.keys(flair?.noteEditors ?? {})).toEqual([]);
  });
});

describe("deriveVoiceMemberFlair — what it passes through", () => {
  it("hands the room's clock and its open callback back unchanged", () => {
    const flair = deriveVoiceMemberFlair(
      overlayFor("consumer_club"),
      NOW,
      openNote,
    );

    // One clock for the whole room, so every row's badge agrees with every
    // other row's.
    expect(flair?.now).toBe(NOW);
    expect(flair?.onOpenNote).toBe(openNote);
  });
});
