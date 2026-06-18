import { z } from "zod";

/**
 * Response of POST /api/voice/token. `sessionOpensAt` is the current session
 * window's open time (ISO) — the client stamps it onto private-zone occupancy
 * rows so the token endpoint can match the current window, so a malformed value
 * here must fail loudly rather than silently break window matching.
 */
export const voiceTokenResponse = z.object({
  token: z.string(),
  roomUrl: z.string(),
  role: z.string(),
  sessionOpensAt: z.string(),
});
