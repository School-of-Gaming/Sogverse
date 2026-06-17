import { describe, it, expect } from "vitest";
import {
  zoneVolume,
  computeZoneVolumes,
  type RemoteAudioState,
} from "@/lib/voice/audio-routing";

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

/**
 * The full routing projection the provider applies on *every* participant
 * update. The regression it guards: a remote peer changing zones (a `userData`
 * change with no track change) must re-silence them for an observer in another
 * zone. The old code only re-routed on track changes, so the observer kept
 * hearing a peer who had walked into a different zone.
 */
describe("computeZoneVolumes", () => {
  const lobby = "lobby";
  const yty = "yty-glow";
  const remotes: RemoteAudioState[] = [
    { sessionId: "same", zoneId: lobby, broadcasting: false, base: 1 },
    { sessionId: "other", zoneId: yty, broadcasting: false, base: 1 },
    { sessionId: "caster", zoneId: yty, broadcasting: true, base: 1 },
  ];

  it("silences peers in other zones, keeps same-zone peers and broadcasters", () => {
    const volumes = computeZoneVolumes(remotes, lobby, false);
    expect(volumes.get("same")).toBe(1); // co-located → audible
    expect(volumes.get("other")).toBe(0); // different zone → silenced
    expect(volumes.get("caster")).toBe(1); // broadcaster → heard anywhere
  });

  it("re-silences a peer the moment they move to another zone (the leak)", () => {
    // Both in the lobby → audible.
    const together: RemoteAudioState[] = [
      { sessionId: "peer", zoneId: lobby, broadcasting: false, base: 1 },
    ];
    expect(computeZoneVolumes(together, lobby, false).get("peer")).toBe(1);

    // Same peer, same tracks, now reports a different zone via userData →
    // re-projecting must drop them to 0 even though nothing about their audio
    // track changed.
    const movedAway: RemoteAudioState[] = [
      { sessionId: "peer", zoneId: yty, broadcasting: false, base: 1 },
    ];
    expect(computeZoneVolumes(movedAway, lobby, false).get("peer")).toBe(0);
  });

  it("deafen silences every remote regardless of zone", () => {
    const volumes = computeZoneVolumes(remotes, lobby, true);
    expect([...volumes.values()]).toEqual([0, 0, 0]);
  });

  it("returns an empty map when there are no remotes", () => {
    expect(computeZoneVolumes([], lobby, false).size).toBe(0);
  });
});
