import { NextResponse } from "next/server";
import { getDailyRoom } from "@/lib/daily";
import { normalizeVoiceRoomCode } from "@/lib/voice-room-code";

/**
 * Cheap existence check for an instant voice room.
 *
 * Public — anyone can call. Used by the lobby on mount so the
 * `RoomNotFoundScreen` can render before we ask the user to grant
 * camera/mic permission and pick a display name. Returning the same
 * 404/200 shape the token route uses keeps the lobby's transition
 * logic uniform.
 *
 * The token route also re-validates existence at join time, so a
 * room that gets deleted between the check and the join still flows
 * through the not-found UX.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = normalizeVoiceRoomCode(url.searchParams.get("code"));
  if (!code) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  const room = await getDailyRoom(code);
  if (!room) {
    return NextResponse.json(
      { error: "room_not_found", code },
      { status: 404 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
