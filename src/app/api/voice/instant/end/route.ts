import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
import { deleteDailyRoom, DailyApiError } from "@/lib/daily";
import { normalizeVoiceRoomCode } from "@/lib/voice-room-code";

/**
 * End an instant voice room for everyone.
 *
 * Mods only — guests can leave individually but cannot kill the call.
 * Deleting the Daily.co room ejects every connected participant; the
 * client-side `left-meeting` event flows them through to the
 * call-ended screen. There's no ownership check beyond "is a mod" — any
 * admin or gedu with the code can end any room. Acceptable: mods are
 * trusted, and there's no concept of room ownership in this model.
 */
export async function POST(request: Request) {
  const result = await requireRole(["admin", "gedu"], {
    forbiddenMessage: "Only admins and educators can end voice rooms",
  });
  if (result instanceof NextResponse) return result;

  const body = await parseJsonBody(
    request,
    z.object({ code: z.string() }),
  );
  if (body instanceof NextResponse) return body;

  const code = normalizeVoiceRoomCode(body.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  try {
    await deleteDailyRoom(code);
  } catch (err) {
    // 404 is a no-op success: the room was already ended, expired, or
    // never existed. Any other status is a real failure.
    if (err instanceof DailyApiError && err.status === 404) {
      return new NextResponse(null, { status: 204 });
    }
    console.error("Failed to delete instant voice room:", err);
    return NextResponse.json(
      { error: "Failed to end voice room" },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
