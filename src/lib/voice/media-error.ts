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
 * The next media-error value given the local participant's current track
 * states. This is the *health* half of the local media model: on/off is the
 * user's intent and is owned synchronously elsewhere, while the track states
 * say only whether the device is delivering right now (see
 * `src/components/voice/CLAUDE.md`). Nothing here may decide whether a mic or
 * camera is "on".
 *
 * Pure, so it can be called on every Daily event without reasoning about
 * ordering. The precedence, in order:
 *
 * 1. Audio `interrupted` — the mic exists and was not turned off, but the
 *    browser has reported it as not delivering for long enough that Daily gave
 *    up on it. That is the one condition worth telling the user about here.
 * 2. Either track `playable` — a live local track proves the device subsystem
 *    works, so any prior acquisition error is stale. (iOS shares one mic/camera
 *    grant, so either track playing clears the shared-permission error.)
 * 3. Audio `off` while we were reporting `interrupted` — the user turned their
 *    mic off, so there is nothing wrong to report any more.
 * 4. Otherwise keep what we had: acquisition errors (denied / no-device /
 *    in-use, set from Daily's `camera-error`) persist until a track plays.
 */
export function nextLocalMediaError(
  prev: MediaErrorCategory | null,
  audioState: DailyTrackState["state"],
  videoState: DailyTrackState["state"],
): MediaErrorCategory | null {
  if (audioState === "interrupted") return "interrupted";
  if (audioState === "playable" || videoState === "playable") return null;
  if (audioState === "off" && prev === "interrupted") return null;
  return prev;
}
