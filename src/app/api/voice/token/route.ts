import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMeetingToken } from "@/lib/daily";

export async function POST(request: Request) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get profile + role
    const { data: profileData } = await supabase
      .from("profiles")
      .select("role, display_name, username")
      .eq("id", user.id)
      .single();

    const profile = profileData as { role: string; display_name: string | null; username: string | null } | null;
    if (!profile || !["gedu", "gamer", "admin"].includes(profile.role)) {
      return NextResponse.json(
        { error: "You do not have permission to join voice rooms" },
        { status: 403 }
      );
    }

    const role = profile.role;

    // 3. Parse body
    const body = await request.json();
    const { roomId } = body;

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 }
      );
    }

    // 4. Fetch the room (using admin client to bypass RLS)
    const admin = createAdminClient();
    const { data: room, error: roomError } = await admin
      .from("voice_rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // 5. Room must be open
    if (room.status !== "open") {
      return NextResponse.json(
        { error: "This room is not currently open" },
        { status: 403 }
      );
    }

    // 6. Build token — encode userId|role|displayName
    const displayName = profile.display_name || profile.username || "User";
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
