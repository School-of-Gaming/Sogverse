import { describe, it, expect } from "vitest";
import {
  nextConfinement,
  type ConfinementState,
} from "@/lib/voice/confinement";

/**
 * The placed-gamer auto-confinement decision as a pure reducer. The reducer
 * keeps a gamer pinned in their assigned private zone, but its real job is to
 * NOT fight a moderator moving them back out — a two-channel race (occupancy-row
 * delete via realtime + `moveUser` via Daily) that the old imperative effect got
 * wrong, snapping the gamer to the lobby instead of the target normal zone.
 */
describe("nextConfinement", () => {
  const base: ConfinementState = {
    myZone: null,
    currentZoneId: "lobby",
    confinedZone: null,
    currentZoneIsLocked: false,
  };

  it("pulls a freshly-placed gamer into their private zone (initial placement)", () => {
    // Row P just appeared; gamer still in the lobby and never confined.
    expect(
      nextConfinement({ ...base, myZone: "P", currentZoneId: "lobby", confinedZone: null }),
    ).toEqual({ action: "confine", confinedZone: null });
  });

  it("records the guard once the gamer has reached their private zone", () => {
    expect(
      nextConfinement({
        myZone: "P",
        currentZoneId: "P",
        confinedZone: null,
        currentZoneIsLocked: true,
      }),
    ).toEqual({ action: "none", confinedZone: "P" });
  });

  /**
   * The regression. A moderator's "free-then-move": delete the occupancy row and
   * `moveUser` the gamer to normal zone X. The moveUser lands first, so for a
   * window the row (P) still exists while the gamer already stands in X. The old
   * code re-confined to P here, then released to the lobby when the row deleted.
   */
  describe("moderator free-then-move (the lobby-snap bug)", () => {
    it("does NOT re-confine while the lingering row races its own deletion", () => {
      // moveUser landed: currentZoneId=X (normal), row P still present, and we
      // had already confined into P. Must do nothing — not pull back to P.
      expect(
        nextConfinement({
          myZone: "P",
          currentZoneId: "X",
          confinedZone: "P",
          currentZoneIsLocked: false,
        }),
      ).toEqual({ action: "none", confinedZone: "P" });
    });

    it("does NOT snap to the lobby once the row is gone and we're in a normal zone", () => {
      // Row finally deleted: no occupancy, standing in normal X. Stay put.
      expect(
        nextConfinement({
          myZone: null,
          currentZoneId: "X",
          confinedZone: "P",
          currentZoneIsLocked: false,
        }),
      ).toEqual({ action: "none", confinedZone: null });
    });

    it("replays the full sequence and lands the gamer in the target zone, not the lobby", () => {
      let confinedZone: string | null = null;
      const step = (s: Omit<ConfinementState, "confinedZone">) => {
        const r = nextConfinement({ ...s, confinedZone });
        confinedZone = r.confinedZone;
        return r.action;
      };

      // 1. placed in P → pull in
      expect(step({ myZone: "P", currentZoneId: "lobby", currentZoneIsLocked: false })).toBe("confine");
      // 2. arrived in P → guard records P
      expect(step({ myZone: "P", currentZoneId: "P", currentZoneIsLocked: true })).toBe("none");
      expect(confinedZone).toBe("P");
      // 3. moveUser lands us in normal X, row P still present → DON'T re-confine
      expect(step({ myZone: "P", currentZoneId: "X", currentZoneIsLocked: false })).toBe("none");
      // 4. row deletion arrives, standing in normal X → DON'T snap to lobby
      expect(step({ myZone: null, currentZoneId: "X", currentZoneIsLocked: false })).toBe("none");
      expect(confinedZone).toBeNull();
    });

    it("still releases to the lobby if the row vanishes while standing in the private zone", () => {
      // The other race ordering: row deleted before any moveUser, so the gamer
      // is still in P. Here releasing to the lobby IS correct.
      expect(
        nextConfinement({
          myZone: null,
          currentZoneId: "P",
          confinedZone: "P",
          currentZoneIsLocked: true,
        }),
      ).toEqual({ action: "releaseToLobby", confinedZone: null });
    });
  });

  it("follows a direct private→private move (new zone differs from the guard)", () => {
    // Mod drags a confined gamer from P straight to locked Q: occupancy upserts
    // to Q while the gamer still stands in P and the guard still reads P.
    expect(
      nextConfinement({
        myZone: "Q",
        currentZoneId: "P",
        confinedZone: "P",
        currentZoneIsLocked: true,
      }),
    ).toEqual({ action: "confine", confinedZone: "P" });
  });

  it("does nothing for an unplaced gamer standing in a normal zone", () => {
    expect(nextConfinement(base)).toEqual({ action: "none", confinedZone: null });
  });
});
