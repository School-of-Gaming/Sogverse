/**
 * Pure audio-routing decision for the discrete-zone voice model
 * (see src/components/voice/CLAUDE.md).
 *
 * This replaces the spatial `canHearZone` geometry with simple zone equality
 * plus the broadcast/deafen toggles. The result is the value written to a
 * remote participant's `<audio>.element.volume` — the only audible control in
 * the pipeline (see src/components/voice/CLAUDE.md and
 * docs/chrome-webrtc-volume-bug.md). The separate analyser pipeline that drives
 * speaking glow + video is unaffected: cross-zone media is still *received*,
 * just silenced, so glow and video stay visible across zones (soft isolation).
 *
 * Hard-isolated locked zones don't go through this function at all — they are a
 * separate Daily room, so non-members never receive the track.
 */
export interface ZoneVolumeInput {
  /** Is the *local* listener deafened? (moderator-only toggle) */
  localIsDeafened: boolean;
  /** Is the *remote* speaker broadcasting? (heard in every zone) */
  remoteIsBroadcasting: boolean;
  /** The local listener's current zone id. */
  localZoneId: string;
  /** The remote speaker's current zone id. */
  remoteZoneId: string;
  /**
   * Per-participant volume multiplier (the old slider's `base`). The slider UI
   * is dropped (§12) so this is effectively 1.0, but the plumbing is kept so it
   * can be re-enabled cheaply — see TODO.md.
   */
  base: number;
}

/** The volume (0..base) to apply to a remote participant's audio element. */
export function zoneVolume({
  localIsDeafened,
  remoteIsBroadcasting,
  localZoneId,
  remoteZoneId,
  base,
}: ZoneVolumeInput): number {
  // Deafen wins over everything: the local user hears no one.
  if (localIsDeafened) return 0;
  // A broadcaster is heard everywhere, regardless of zone.
  if (remoteIsBroadcasting) return base;
  // Same zone → audible; different zone → silenced (but still received).
  if (remoteZoneId === localZoneId) return base;
  return 0;
}

/** One remote participant's audio-routing inputs (their session + zone state). */
export interface RemoteAudioState {
  sessionId: string;
  zoneId: string;
  broadcasting: boolean;
  /** Per-participant volume multiplier (the old slider's `base`); see above. */
  base: number;
}

/**
 * The full routing decision as a pure projection: every remote's target
 * `<audio>.element.volume` from the current zone map + local listener state.
 * The provider applies this on *every* participant update, so a remote changing
 * zones (a `userData` change with no track change) re-routes the listener — the
 * gap that previously let cross-zone audio leak. Exhaustively unit-testable
 * because it's just data in → `Map` out, no Daily/DOM.
 */
export function computeZoneVolumes(
  remotes: RemoteAudioState[],
  localZoneId: string,
  localIsDeafened: boolean,
): Map<string, number> {
  const volumes = new Map<string, number>();
  for (const r of remotes) {
    volumes.set(
      r.sessionId,
      zoneVolume({
        localIsDeafened,
        remoteIsBroadcasting: r.broadcasting,
        localZoneId,
        remoteZoneId: r.zoneId,
        base: r.base,
      }),
    );
  }
  return volumes;
}
