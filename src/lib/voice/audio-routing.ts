/**
 * Pure audio-routing decision for the discrete-zone voice model
 * (see src/components/voice/CLAUDE.md).
 *
 * The decision is binary — a remote is either audible or silenced — and it's
 * applied via `<audio>.element.muted`, NOT `element.volume`. That distinction
 * matters: on iOS Safari (iPhone) `element.volume` is a documented no-op (the
 * volume property is not settable in JavaScript and always reads 1 — Apple's
 * "Safari HTML5 Audio and Video Guide"), so the old `volume = 0` silencing never
 * worked there and zone audio leaked across every soft zone on iPhone.
 * `element.muted` IS honored on iOS, so it's the single cross-platform control.
 *
 * The separate analyser pipeline that drives speaking glow + video is
 * unaffected: cross-zone media is still *received* (the analyser reads its own
 * MediaStreamSource off the track), just muted, so glow and video stay visible
 * across zones (soft isolation).
 *
 * Private (locked) zones add a *receive-side* boundary on top of this: an
 * outsider is blocked at the SFU via Daily `canReceive` (see
 * src/lib/voice/receive-permissions.ts), so they're never sent the track and
 * this mute decision is moot for that pair. For pairs that aren't blocked
 * (e.g. a private-zone occupant looking out at a normal zone, which Daily still
 * delivers), this function mutes the cross-zone audio client-side as usual.
 */
export interface ZoneAudibilityInput {
  /** Is the *local* listener deafened? (moderator-only toggle) */
  localIsDeafened: boolean;
  /** Is the *remote* speaker broadcasting? (heard in every zone) */
  remoteIsBroadcasting: boolean;
  /** The local listener's current zone id. */
  localZoneId: string;
  /** The remote speaker's current zone id. */
  remoteZoneId: string;
}

/** Whether a remote participant should be audible to the local listener. */
export function isAudible({
  localIsDeafened,
  remoteIsBroadcasting,
  localZoneId,
  remoteZoneId,
}: ZoneAudibilityInput): boolean {
  // Deafen wins over everything: the local user hears no one.
  if (localIsDeafened) return false;
  // A broadcaster is heard everywhere, regardless of zone.
  if (remoteIsBroadcasting) return true;
  // Same zone → audible; different zone → silenced (but still received).
  return remoteZoneId === localZoneId;
}

/** One remote participant's audio-routing inputs (their session + zone state). */
export interface RemoteAudioState {
  sessionId: string;
  zoneId: string;
  broadcasting: boolean;
}

/**
 * The full routing decision as a pure projection: every remote's audibility from
 * the current zone map + local listener state. The provider applies this on
 * *every* participant update, so a remote changing zones (a `userData` change
 * with no track change) re-routes the listener — the gap that previously let
 * cross-zone audio leak. Exhaustively unit-testable because it's just data in →
 * `Map` out, no Daily/DOM. `true` = audible, `false` = muted.
 */
export function computeZoneAudibility(
  remotes: RemoteAudioState[],
  localZoneId: string,
  localIsDeafened: boolean,
): Map<string, boolean> {
  const audible = new Map<string, boolean>();
  for (const r of remotes) {
    audible.set(
      r.sessionId,
      isAudible({
        localIsDeafened,
        remoteIsBroadcasting: r.broadcasting,
        localZoneId,
        remoteZoneId: r.zoneId,
      }),
    );
  }
  return audible;
}
