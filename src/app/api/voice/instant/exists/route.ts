import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { getDailyRoom } from "@/lib/daily";
import { normalizeVoiceRoomCode } from "@/lib/voice-room-code";

/**
 * GET /api/voice/instant/exists — cheap existence check for an instant room.
 *
 * Used by the lobby on mount so the room-not-found screen can render before we
 * ask the user to grant camera/mic permission and pick a display name.
 * Returning the same 404/204 shape the token route uses keeps the lobby's
 * transition logic uniform.
 *
 * The token route also re-validates existence at join time, so a room deleted
 * between the check and the join still flows through the not-found UX.
 */
export const GET = defineRoute({
  posture: "public",
  reason:
    "the lobby checks whether a room code resolves before asking for camera and microphone permission, and a guest joining by link has no session. Reveals only that a code exists, which anyone holding the code could learn by joining",
  query: z.object({ code: z.string() }),

  handler: async ({ query }) => {
    const code = normalizeVoiceRoomCode(query.code);
    if (!code) {
      return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
    }

    const room = await getDailyRoom(code);
    if (!room) {
      // The echoed code lets the lobby show the user what they typed.
      return NextResponse.json({ error: "room_not_found", code }, { status: 404 });
    }

    // Existence is the whole answer: the wrapper turns undefined into 204.
    return undefined;
  },
});
