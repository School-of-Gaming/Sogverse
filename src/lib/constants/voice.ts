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
} as const;
