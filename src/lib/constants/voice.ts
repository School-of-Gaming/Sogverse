export const VOICE_CONFIG = {
  /** Meeting token expiry in seconds (2.5 hours) */
  TOKEN_EXPIRY_SECONDS: 2.5 * 60 * 60,
  /** Maximum participants per room */
  MAX_PARTICIPANTS: 50,
  /** Fallback polling interval if Realtime fails (ms) */
  REALTIME_POLL_INTERVAL_MS: 30_000,
} as const;
