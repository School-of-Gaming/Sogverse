import { describe, it, expect } from "vitest";
import {
  blockedUserIdsFor,
  tokenCanReceiveFor,
  type PrivateOccupant,
} from "@/lib/voice/receive-permissions";

/**
 * The private-zone privacy boundary as a pure projection. The rule: a viewer may
 * receive everyone except a private-zone occupant whose zone the viewer is not
 * also in. One-directional and SFU-enforced (see receive-permissions.ts).
 */
describe("blockedUserIdsFor", () => {
  const occupants: PrivateOccupant[] = [
    { userId: "alice", zoneId: "z1" },
    { userId: "bob", zoneId: "z1" },
    { userId: "carol", zoneId: "z2" },
  ];

  it("blocks an outsider from every private occupant", () => {
    expect(blockedUserIdsFor("outsider", occupants).sort()).toEqual(
      ["alice", "bob", "carol"].sort(),
    );
  });

  it("does not block a normal-zone viewer's normal-zone peers (only occupants appear)", () => {
    // The projection only ever blocks private occupants; peers in normal zones
    // are never in the occupant list, so they're never returned.
    expect(blockedUserIdsFor("outsider", [])).toEqual([]);
  });

  it("lets a private occupant keep their own zone-mates, blocks other private zones", () => {
    // alice (z1) receives bob (z1) but not carol (z2).
    expect(blockedUserIdsFor("alice", occupants)).toEqual(["carol"]);
  });

  it("never blocks the viewer from themselves", () => {
    expect(blockedUserIdsFor("alice", occupants)).not.toContain("alice");
  });

  it("blocks nobody when there are no occupants", () => {
    expect(blockedUserIdsFor("alice", [])).toEqual([]);
  });
});

describe("tokenCanReceiveFor", () => {
  const occupants: PrivateOccupant[] = [
    { userId: "alice", zoneId: "z1" },
    { userId: "carol", zoneId: "z2" },
  ];

  it("returns undefined when nothing is blocked (so the token sends no permission)", () => {
    expect(tokenCanReceiveFor("nobody-private", [])).toBeUndefined();
    // A lone occupant is co-zoned only with themselves → blocks no one.
    expect(tokenCanReceiveFor("alice", [{ userId: "alice", zoneId: "z1" }])).toBeUndefined();
  });

  it("bakes base:true plus a false block per non-co-zoned occupant", () => {
    expect(tokenCanReceiveFor("outsider", occupants)).toEqual({
      base: true,
      byUserId: { alice: false, carol: false },
    });
  });

  it("blocks only other private zones for an occupant", () => {
    // alice (z1) blocks carol (z2), not herself.
    expect(tokenCanReceiveFor("alice", occupants)).toEqual({
      base: true,
      byUserId: { carol: false },
    });
  });
});
