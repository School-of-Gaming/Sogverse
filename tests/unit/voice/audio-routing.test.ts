import { describe, it, expect } from "vitest";
import { zoneVolume } from "@/lib/voice/audio-routing";

/**
 * The discrete-zone routing decision (see src/components/voice/CLAUDE.md):
 *   deafen  → 0
 *   broadcast → base (heard everywhere)
 *   same zone → base
 *   different zone → 0 (silenced, but still received)
 */
describe("zoneVolume", () => {
  const lobby = "lobby";
  const yty = "yty-glow";

  it("deafen silences everyone, even a same-zone broadcaster", () => {
    expect(
      zoneVolume({
        localIsDeafened: true,
        remoteIsBroadcasting: true,
        localZoneId: lobby,
        remoteZoneId: lobby,
        base: 1,
      }),
    ).toBe(0);
  });

  it("a broadcaster is heard from a different zone", () => {
    expect(
      zoneVolume({
        localIsDeafened: false,
        remoteIsBroadcasting: true,
        localZoneId: lobby,
        remoteZoneId: yty,
        base: 1,
      }),
    ).toBe(1);
  });

  it("same zone is audible", () => {
    expect(
      zoneVolume({
        localIsDeafened: false,
        remoteIsBroadcasting: false,
        localZoneId: yty,
        remoteZoneId: yty,
        base: 1,
      }),
    ).toBe(1);
  });

  it("different zone is silenced", () => {
    expect(
      zoneVolume({
        localIsDeafened: false,
        remoteIsBroadcasting: false,
        localZoneId: lobby,
        remoteZoneId: yty,
        base: 1,
      }),
    ).toBe(0);
  });

  it("applies the base multiplier when audible", () => {
    expect(
      zoneVolume({
        localIsDeafened: false,
        remoteIsBroadcasting: false,
        localZoneId: lobby,
        remoteZoneId: lobby,
        base: 0.5,
      }),
    ).toBe(0.5);
  });

  it("deafen takes priority over the base multiplier", () => {
    expect(
      zoneVolume({
        localIsDeafened: true,
        remoteIsBroadcasting: false,
        localZoneId: lobby,
        remoteZoneId: lobby,
        base: 0.8,
      }),
    ).toBe(0);
  });
});
