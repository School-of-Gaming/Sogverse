import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createDailyRoom, isDailyDuplicateRoomError } from "@/lib/daily";
import { generateVoiceRoomCode } from "@/lib/voice-room-code";
import { VOICE_CONFIG } from "@/lib/constants/voice";

/**
 * Create a new instant voice room.
 *
 * Allocates a 4-character code, asks Daily.co to create a room with that
 * name, and returns the code. Daily's `exp` property gives the room a hard
 * 8-hour lifetime — past that Daily destroys it whether or not anyone is
 * still connected. We don't track rooms in our DB; the code in the URL is
 * the only handle.
 *
 * Collisions are rare (~1 in 2,000 with 500 concurrent rooms) so we don't
 * pre-check the code. If Daily says the room name already exists, we
 * generate a fresh code and try again — `INSTANT_ROOM_CREATE_MAX_RETRIES`
 * times. (We can't use the `getOrCreateDailyRoom` helper here: random
 * codes are not authorization-pre-gated, so silently joining the existing
 * room on collision would let a caller into someone else's instant room.)
 */
export async function POST() {
  const result = await requireRole(["admin", "gedu"], {
    forbiddenMessage: "Only admins and educators can create voice rooms",
  });
  if (result instanceof NextResponse) return result;

  const expUnix =
    Math.round(Date.now() / 1000) + VOICE_CONFIG.INSTANT_ROOM_EXP_SECONDS;

  for (let attempt = 0; attempt < VOICE_CONFIG.INSTANT_ROOM_CREATE_MAX_RETRIES; attempt++) {
    const code = generateVoiceRoomCode();
    try {
      await createDailyRoom({ name: code, expUnix });
      return NextResponse.json({ code });
    } catch (err) {
      // Duplicate-name means the random code happened to collide — try
      // again with a fresh code. Anything else is a real failure; bail.
      if (isDailyDuplicateRoomError(err)) {
        continue;
      }
      console.error("Failed to create instant voice room:", err);
      return NextResponse.json(
        { error: "Failed to create voice room" },
        { status: 500 },
      );
    }
  }

  // Exhausted retries — astronomically unlikely. Surface so we hear about it.
  console.error(
    `Could not allocate an instant voice room code after ${VOICE_CONFIG.INSTANT_ROOM_CREATE_MAX_RETRIES} attempts`,
  );
  return NextResponse.json(
    { error: "Could not allocate a voice room code; please try again" },
    { status: 503 },
  );
}
