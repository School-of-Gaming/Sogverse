import { describe, it, expect } from "vitest";
import {
  correctSelfOccupancy,
  type SelfOccupancyState,
} from "@/lib/voice/self-occupancy";
import { blockedUserIdsFor } from "@/lib/voice/receive-permissions";

/**
 * The local user's *own* private-zone occupancy must come from synchronous truth,
 * not the realtime echo of it. The bug this guards: a moderator who self-leaves a
 * private zone stayed pinned in it because the occupancy DELETE echo to their own
 * client lagged or dropped on mobile Safari. The fix — and these tests — assert
 * that a moderator's own row follows the zone they're synchronously standing in,
 * while a gamer's row (mod-written, no self-move agency) is trusted as echoed.
 */
describe("correctSelfOccupancy", () => {
  const MOD = "mod-1";
  const GAMER = "gamer-1";
  const PRIVATE = "private-zone";

  const base: SelfOccupancyState = {
    echoed: [],
    localUserId: MOD,
    isModerator: true,
    localZoneId: "lobby",
    localZoneIsLocked: false,
  };

  describe("moderator self-occupancy (the stuck-mod bug)", () => {
    it("drops the mod's lingering own row after they've left (lost/late DELETE echo)", () => {
      // The headline regression: synchronous membership says lobby, but the echo
      // still has our private-zone row. We must NOT report ourselves as private.
      const result = correctSelfOccupancy({
        ...base,
        echoed: [{ userId: MOD, zoneId: PRIVATE }],
        localZoneId: "lobby",
        localZoneIsLocked: false,
      });
      expect(result).toEqual([]);
    });

    it("adds the mod's own row from synchronous truth before the INSERT echo lands", () => {
      // Inverse direction: we've stepped into a locked zone but the echo hasn't
      // caught up. Privacy shouldn't wait for the round-trip.
      const result = correctSelfOccupancy({
        ...base,
        echoed: [],
        localZoneId: PRIVATE,
        localZoneIsLocked: true,
      });
      expect(result).toEqual([{ userId: MOD, zoneId: PRIVATE }]);
    });

    it("does not duplicate the mod's own row when the echo already agrees", () => {
      const result = correctSelfOccupancy({
        ...base,
        echoed: [{ userId: MOD, zoneId: PRIVATE }],
        localZoneId: PRIVATE,
        localZoneIsLocked: true,
      });
      expect(result).toEqual([{ userId: MOD, zoneId: PRIVATE }]);
    });

    it("never touches other users' rows — only the local user's own", () => {
      const others = [
        { userId: GAMER, zoneId: PRIVATE },
        { userId: "mod-2", zoneId: "other-private" },
      ];
      const result = correctSelfOccupancy({
        ...base,
        echoed: [...others, { userId: MOD, zoneId: PRIVATE }],
        localZoneId: "lobby",
        localZoneIsLocked: false,
      });
      expect(result).toEqual(others);
    });
  });

  describe("the confinement exception", () => {
    it("trusts a gamer's echoed row even if their own client thinks they left", () => {
      // A confined gamer has no self-move agency: the mod-written row is their
      // truth and must outrank their own (possibly spoofed/lagged) position, or
      // they could edit their way out of confinement.
      const result = correctSelfOccupancy({
        echoed: [{ userId: GAMER, zoneId: PRIVATE }],
        localUserId: GAMER,
        isModerator: false,
        localZoneId: "lobby",
        localZoneIsLocked: false,
      });
      expect(result).toEqual([{ userId: GAMER, zoneId: PRIVATE }]);
    });

    it("returns the echo unchanged before the local user is identified", () => {
      const echoed = [{ userId: MOD, zoneId: PRIVATE }];
      expect(
        correctSelfOccupancy({ ...base, echoed, localUserId: null }),
      ).toBe(echoed);
    });
  });

  // The correction exists to feed the privacy projection, so assert the
  // user-visible guarantee end-to-end: an outside viewer's block set.
  describe("composed with the canReceive projection", () => {
    it("un-blocks an outsider from the mod the instant the mod leaves (no echo wait)", () => {
      const VIEWER = "viewer-1";
      const echoed = [{ userId: MOD, zoneId: PRIVATE }]; // echo still stale
      const corrected = correctSelfOccupancy({
        ...base,
        echoed,
        localZoneId: "lobby",
        localZoneIsLocked: false,
      });
      // Before correction the viewer would still be blocked from the mod...
      expect(blockedUserIdsFor(VIEWER, echoed)).toEqual([MOD]);
      // ...after it, the mod is receivable again immediately.
      expect(blockedUserIdsFor(VIEWER, corrected)).toEqual([]);
    });
  });
});
