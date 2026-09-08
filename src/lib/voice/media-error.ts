import type { DailyCameraErrorType, DailyTrackState } from "@daily-co/daily-js";

/**
 * The actionable category of a microphone/camera acquisition failure — what the
 * UI keys its recovery copy on.
 *
 * On iOS Safari there is no Permissions API for camera/mic (see
 * `use-mic-devices.ts`), so the *only* reliable signal is the error a real
 * acquisition attempt produces. This is also why the previous "infer denied from
 * an empty device list" heuristic was so weak — it couldn't tell denied apart
 * from never-asked. A real error name (ours) or Daily's normalized `camera-error`
 * type can.
 *
 * Note `"denied"` is intentionally not "the user denied it": a `NotAllowedError`
 * is returned identically for an explicit "Don't Allow", a remembered denial from
 * a past session (no prompt shown), and a dismissed prompt. We can know for
 * certain we *lack* access; we can't know the user's intent. Recovery copy is
 * phrased as a conditional because of this.
 */
export type MediaErrorCategory =
  | "denied" // NotAllowedError / permissions — no access granted
  | "no-device" // NotFoundError — no mic/camera present
  | "in-use" // NotReadableError / *-in-use — held by another app/tab or hardware error
  | "insecure" // navigator.mediaDevices missing — not a secure (https) context
  /**
   * The track was acquired and the user has *not* turned it off, but the
   * browser reports it as not delivering — the device was dropped or muted at
   * the OS/Bluetooth level. Unlike the categories above this is not an
   * acquisition failure: nothing was denied and no device is missing, so the
   * recovery is reconnecting the device (or unmuting it where the OS muted it),
   * re-picking it in the device list, or reloading.
   */
  | "interrupted"
  | "unknown";

/**
 * Classify a raw `getUserMedia` rejection (our own probe — e.g. the instant-room
 * lobby's pre-join acquisition). For failures surfaced by Daily during a call,
 * use {@link categoryFromDailyCameraError} instead — Daily normalizes the error
 * before we ever see the DOMException.
 */
export function classifyMediaError(err: unknown): MediaErrorCategory {
  // No mediaDevices at all → insecure context (http origin etc.); getUserMedia
  // was never callable. Checked first because there's no DOMException to read.
  // The DOM lib types `navigator.mediaDevices` as always-present, but it's
  // genuinely `undefined` on an insecure origin — so read it as nullable.
  const mediaDevices =
    typeof navigator !== "undefined"
      ? (navigator.mediaDevices as MediaDevices | undefined)
      : undefined;
  if (!mediaDevices) {
    return "insecure";
  }
  const name =
    err instanceof DOMException
      ? err.name
      : err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
      return "no-device";
    case "NotReadableError":
    case "AbortError":
      return "in-use";
    default:
      return "unknown";
  }
}

/**
 * Map Daily's normalized `camera-error` event type to our category. Daily does
 * the cross-browser normalization of the underlying getUserMedia failure for us,
 * so this is the source of truth for in-call / join-time failures.
 */
export function categoryFromDailyCameraError(
  type: DailyCameraErrorType,
): MediaErrorCategory {
  switch (type) {
    case "permissions":
      return "denied";
    case "not-found":
      return "no-device";
    case "cam-in-use":
    case "mic-in-use":
    case "cam-mic-in-use":
      return "in-use";
    case "undefined-mediadevices":
      return "insecure";
    case "constraints":
    case "unknown":
    default:
      return "unknown";
  }
}

/**
 * The next media-error value given the local participant's own audio track
 * state. This is the *health* half of the local media model: on/off is the
 * user's intent and is owned synchronously elsewhere, while the track state
 * says only whether the device is delivering right now (see
 * `src/components/voice/CLAUDE.md`). Nothing here may decide whether a mic or
 * camera is "on".
 *
 * It is specifically the **microphone's** health, because the surface it feeds
 * is the mic troubleshooting popover — a device list and a level meter — and
 * everything it can offer as a recovery is about the mic. The camera has no
 * health surface of its own: a camera toggle that throws still writes its
 * classified error into this same value, and that report lasts only until the
 * next mic-health tick overwrites it. That is the pre-existing behaviour and it
 * is the accepted limitation of having one channel for two devices, not a
 * property worth relying on.
 *
 * Pure, so it can be called on every Daily event without reasoning about
 * ordering. The rules, in order:
 *
 * 1. `blocked` — acquisition failed, and the reason object says why: no
 *    permission, no device, or the device is held elsewhere. A blocked track
 *    with none of the three set keeps whatever we had, falling back to
 *    `"unknown"`, because Daily's `camera-error` event is the only source for
 *    the reasons this object cannot express (an insecure context, unsatisfiable
 *    constraints) and must not be overwritten by a vaguer answer.
 * 2. `interrupted` — the mic exists and was not turned off, but the browser has
 *    reported it as not delivering for long enough that Daily gave up on it.
 * 3. `playable` or `off` — nothing is wrong with the mic: it is either working,
 *    or the user deliberately turned it off. Daily reports a mic it could not
 *    acquire as `blocked` and never as `off`, so `off` cannot hide a real
 *    failure.
 * 4. Anything else — keep what we had. `loading` and `sendable` do not arise
 *    for a local track, but the type admits them.
 */
export function nextLocalMediaError(
  prev: MediaErrorCategory | null,
  audio: Pick<DailyTrackState, "state" | "blocked">,
): MediaErrorCategory | null {
  switch (audio.state) {
    case "blocked":
      if (audio.blocked?.byPermissions) return "denied";
      if (audio.blocked?.byDeviceMissing) return "no-device";
      if (audio.blocked?.byDeviceInUse) return "in-use";
      return prev ?? "unknown";
    case "interrupted":
      return "interrupted";
    case "playable":
    case "off":
      return null;
    default:
      return prev;
  }
}
