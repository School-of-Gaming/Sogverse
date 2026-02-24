import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDailyRoom, getDailyRoom } from "@/lib/daily";

export async function POST(request: Request) {
  try {
    const result = await requireRole(["gedu", "admin"], {
      select: "role, display_name, username",
      forbiddenMessage: "Only gedus and admins can manage voice rooms",
    });
    if (result instanceof NextResponse) return result;
    const { user, profile } = result;

    // Parse optional name from body
    let roomName: string | undefined;
    try {
      const body = await request.json();
      roomName = body.name;
    } catch {
      // No body is fine — we'll use a default name
    }

    const admin = createAdminClient();
    const displayName = roomName || (profile.display_name as string | null) || (profile.username as string | null) || "Host";
    const dailyRoomName = `room-${user.id.slice(0, 8)}`;

    // Check if a voice_rooms row already exists for this creator
    const { data: existing } = await admin
      .from("voice_rooms")
      .select("*")
      .eq("creator_id", user.id)
      .single();

    if (existing) {
      // Room row exists
      if (existing.status === "open") {
        // Already open — idempotent
        return NextResponse.json({ room: existing });
      }

      // Closed — ensure Daily.co room exists, then reopen
      const dailyRoom = await getDailyRoom(existing.daily_room_name);
      if (!dailyRoom) {
        await createDailyRoom({ name: existing.daily_room_name });
      }

      const { data: updated, error: updateError } = await admin
        .from("voice_rooms")
        .update({
          status: "open",
          name: displayName,
          opened_at: new Date().toISOString(),
          closed_at: null,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ room: updated });
    }

    // No row — create Daily.co room (if not already on Daily.co) + insert DB row
    const existingDaily = await getDailyRoom(dailyRoomName);
    if (!existingDaily) {
      await createDailyRoom({ name: dailyRoomName });
    }

    const { data: created, error: insertError } = await admin
      .from("voice_rooms")
      .insert({
        creator_id: user.id,
        name: displayName,
        daily_room_name: dailyRoomName,
        status: "open",
        opened_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ room: created });
  } catch (err) {
    console.error("Voice room POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireRole(["gedu", "admin"], {
      forbiddenMessage: "Only gedus and admins can manage voice rooms",
    });
    if (result instanceof NextResponse) return result;
    const { user, profile } = result;

    const role = profile.role as string;

    // Parse optional roomId from body (admin can close another creator's room)
    let roomId: string | undefined;
    try {
      const body = await request.json();
      roomId = body.roomId;
    } catch {
      // No body — close own room
    }

    // Close the room
    const admin = createAdminClient();

    let query = admin
      .from("voice_rooms")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
      });

    if (roomId && role === "admin") {
      // Admin closing a specific room by ID
      query = query.eq("id", roomId);
    } else {
      // Creator closing their own room
      query = query.eq("creator_id", user.id);
    }

    const { data: updated, error: updateError } = await query
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ room: updated });
  } catch (err) {
    console.error("Voice room PATCH error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
