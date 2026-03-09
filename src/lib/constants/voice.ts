export const VOICE_CONFIG = {
  /** Meeting token expiry in seconds (2.5 hours) — used for always-open rooms */
  TOKEN_EXPIRY_SECONDS: 2.5 * 60 * 60,
  /** Maximum participants per room */
  MAX_PARTICIPANTS: 50,
  /** Fallback polling interval if Realtime fails (ms) */
  REALTIME_POLL_INTERVAL_MS: 30_000,
  /** Minutes before session start that the room opens */
  SESSION_WINDOW_BEFORE_MINUTES: 5,
  /** Minutes after session end that the room stays open */
  SESSION_WINDOW_AFTER_MINUTES: 5,
  /**
   * Extra seconds added to the token expiry beyond windowClosesAt.
   * The client auto-leaves when computeSessionWindow() returns isOpen=false
   * (checked every 30s). Without this grace period, the token and the client
   * race to the same deadline — and the token always wins because the 30s
   * interval can't land exactly on the millisecond. The result is a hard
   * Daily.co disconnect with no "session ended" message. Adding 60s ensures
   * the client gets at least one interval tick after the window closes to
   * leave gracefully. The token is then just a backstop for frozen tabs or
   * client bugs.
   */
  TOKEN_EXPIRY_GRACE_SECONDS: 60,
} as const;
