import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { deleteDailyRoom, DailyApiError } from "@/lib/daily";
import { normalizeVoiceRoomCode } from "@/lib/voice-room-code";

/**
 * End an instant voice room for everyone.
 *
 * Mods only — guests can leave individually but cannot kill the call.
 * Deleting the Daily.co room ejects every connected participant; the
 * client-side `left-meeting` event flows them through to the call-ended
 * screen. There's no ownership check beyond "is a mod" — any admin or gedu
 * with the code can end any room. Acceptable: mods are trusted, and there's
 * no concept of room ownership in this model.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["admin", "gedu"],
  forbiddenMessage: "Only admins and educators can end voice rooms",
  // An unverified gedu is not a trusted moderator — same boundary as create.
  requireVerifiedGedu: true,
  body: z.object({ code: z.string() }),

  handler: async ({ body }) => {
    const code = normalizeVoiceRoomCode(body.code);
    if (!code) {
      return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
    }

    try {
      await deleteDailyRoom(code);
    } catch (err) {
      // 404 is a no-op success: the room was already ended, expired, or never
      // existed. Any other status is a real failure — let the wrapper log it.
      if (err instanceof DailyApiError && err.status === 404) return undefined;
      throw err;
    }

    // Nothing to say beyond "it is gone": the wrapper turns undefined into 204.
    return undefined;
  },
});
