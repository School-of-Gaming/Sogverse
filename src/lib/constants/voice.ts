export const VOICE_CONFIG = {
  /** Maximum participants per room */
  MAX_PARTICIPANTS: 50,
  /** Minutes before session start that the room opens */
  SESSION_WINDOW_BEFORE_MINUTES: 5,
  /** Minutes after session end that the room stays open */
  SESSION_WINDOW_AFTER_MINUTES: 5,
  /**
   * Seconds added to `windowClosesAt` to derive the Daily room/token `exp`
   * for scheduled voice rooms. Gives participants a short tail past the
   * stated session-end so a few-second clock skew or a last sentence
   * doesn't get cut off mid-word. Daily ejects everyone at this boundary
   * (rooms and tokens both carry `eject_at_*_exp: true`), and the client's
   * `wasJoined && !joined` branch renders the "Session ended" card from
   * Daily's `left-meeting` event.
   */
  TOKEN_EXPIRY_GRACE_SECONDS: 60,
  /** Minimum per-participant volume (10%) */
  MIN_VOLUME: 0.1,
  /** Maximum per-participant volume (100%) */
  MAX_VOLUME: 1.0,
  /**
   * Hard lifetime (seconds) on instant voice rooms. Daily.co destroys the
   * room at this time even if a call is still active. 8 hours is generous
   * enough for any realistic gathering and short enough that abandoned rooms
   * clean themselves up promptly.
   */
  INSTANT_ROOM_EXP_SECONDS: 8 * 60 * 60,
  /** Max retries on code-collision (Daily 409) when creating an instant room. */
  INSTANT_ROOM_CREATE_MAX_RETRIES: 3,
} as const;
