import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMeetingToken } from "@/lib/daily";

export async function POST(request: Request) {
  try {
    const result = await requireRole(["gedu", "gamer", "admin"], {
      select: "role, display_name, username",
      forbiddenMessage: "You do not have permission to join voice rooms",
    });
    if (result instanceof NextResponse) return result;
    const { user, profile } = result;

    const role = profile.role as string;

    // Parse body
    const body = await request.json();
    const { roomId } = body;

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 }
      );
    }

    // Fetch the room (using admin client to bypass RLS)
    const admin = createAdminClient();
    const { data: room, error: roomError } = await admin
      .from("voice_rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Room must be open
    if (room.status !== "open") {
      return NextResponse.json(
        { error: "This room is not currently open" },
        { status: 403 }
      );
    }

    // Build token — encode userId|role|displayName
    const displayName = (profile.display_name as string | null) || (profile.username as string | null) || "User";
    const userName = `${user.id}|${role}|${displayName}`;
    const domain = process.env.NEXT_PUBLIC_DAILY_DOMAIN;
    if (!domain) {
      console.error("Missing NEXT_PUBLIC_DAILY_DOMAIN environment variable");
      return NextResponse.json(
        { error: "Voice chat is not configured" },
        { status: 500 }
      );
    }
    const roomUrl = `https://${domain}.daily.co/${room.daily_room_name}`;

    // Gamers are non-owners (no moderation); admins/gedus are owners
    const isOwner = role !== "gamer";

    const token = await createMeetingToken({
      roomName: room.daily_room_name,
      isOwner,
      enableCamera: true,
      enableMic: true,
      userName,
    });

    return NextResponse.json({ token, roomUrl, role });
  } catch (err) {
    console.error("Voice token error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
