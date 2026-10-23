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
  standing: z.enum(["moderator", "trainee", "participant"]),
});

/**
 * The token route's refusal code for a group whose product is not joined
 * through a Sogverse room — a meeting elsewhere, or written instructions. The
 * voice page shows its own message for it.
 */
export const NOT_A_SOGVERSE_ROOM = "NOT_A_SOGVERSE_ROOM";

/**
 * What the joiner is in this room, as the token route admitted them.
 *
 * `moderator` is exactly the token's owner flag. `trainee` is a gedu admitted
 * by their trainee seat on this group: a participant's powers, shown the
 * moderator's controls locked. The client reads it from here rather than from
 * the role, because a trainee's role is `gedu`.
 */
export type VoiceRoomStanding = z.infer<typeof voiceTokenResponse>["standing"];
