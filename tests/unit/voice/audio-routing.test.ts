import { describe, it, expect } from "vitest";
import {
  isAudible,
  computeZoneAudibility,
  type RemoteAudioState,
} from "@/lib/voice/audio-routing";

/**
 * The discrete-zone routing decision (see src/components/voice/CLAUDE.md). It's
 * binary and applied via `element.muted` (NOT `element.volume`, which iOS Safari
 * ignores):
 *   deafen        → not audible
 *   broadcast     → audible (heard everywhere)
 *   same zone     → audible
 *   different zone → not audible (silenced, but still received)
 */
describe("isAudible", () => {
  const lobby = "lobby";
  const yty = "yty-glow";

  it("deafen silences everyone, even a same-zone broadcaster", () => {
    expect(
      isAudible({
        localIsDeafened: true,
        remoteIsBroadcasting: true,
        localZoneId: lobby,
        remoteZoneId: lobby,
      }),
    ).toBe(false);
  });

  it("a broadcaster is heard from a different zone", () => {
    expect(
      isAudible({
        localIsDeafened: false,
        remoteIsBroadcasting: true,
        localZoneId: lobby,
        remoteZoneId: yty,
      }),
    ).toBe(true);
  });

  it("same zone is audible", () => {
    expect(
      isAudible({
        localIsDeafened: false,
        remoteIsBroadcasting: false,
        localZoneId: yty,
        remoteZoneId: yty,
      }),
    ).toBe(true);
  });

  it("different zone is silenced", () => {
    expect(
      isAudible({
        localIsDeafened: false,
        remoteIsBroadcasting: false,
        localZoneId: lobby,
        remoteZoneId: yty,
      }),
    ).toBe(false);
  });

  it("deafen takes priority over a same-zone peer", () => {
    expect(
      isAudible({
        localIsDeafened: true,
        remoteIsBroadcasting: false,
        localZoneId: lobby,
        remoteZoneId: lobby,
      }),
    ).toBe(false);
  });
});

/**
 * The full routing projection the provider applies on *every* participant
 * update. The regression it guards: a remote peer changing zones (a `userData`
 * change with no track change) must re-silence them for an observer in another
 * zone. The old code only re-routed on track changes, so the observer kept
 * hearing a peer who had walked into a different zone. `true` = audible.
 */
describe("computeZoneAudibility", () => {
  const lobby = "lobby";
  const yty = "yty-glow";
  const remotes: RemoteAudioState[] = [
    { sessionId: "same", zoneId: lobby, broadcasting: false },
    { sessionId: "other", zoneId: yty, broadcasting: false },
    { sessionId: "caster", zoneId: yty, broadcasting: true },
  ];

  it("silences peers in other zones, keeps same-zone peers and broadcasters", () => {
    const audible = computeZoneAudibility(remotes, lobby, false);
    expect(audible.get("same")).toBe(true); // co-located → audible
    expect(audible.get("other")).toBe(false); // different zone → silenced
    expect(audible.get("caster")).toBe(true); // broadcaster → heard anywhere
  });

  it("re-silences a peer the moment they move to another zone (the leak)", () => {
    // Both in the lobby → audible.
    const together: RemoteAudioState[] = [
      { sessionId: "peer", zoneId: lobby, broadcasting: false },
    ];
    expect(computeZoneAudibility(together, lobby, false).get("peer")).toBe(true);

    // Same peer, same tracks, now reports a different zone via userData →
    // re-projecting must drop them to muted even though nothing about their
    // audio track changed.
    const movedAway: RemoteAudioState[] = [
      { sessionId: "peer", zoneId: yty, broadcasting: false },
    ];
    expect(computeZoneAudibility(movedAway, lobby, false).get("peer")).toBe(false);
  });

  it("deafen silences every remote regardless of zone", () => {
    const audible = computeZoneAudibility(remotes, lobby, true);
    expect([...audible.values()]).toEqual([false, false, false]);
  });

  it("returns an empty map when there are no remotes", () => {
    expect(computeZoneAudibility([], lobby, false).size).toBe(0);
  });
});
