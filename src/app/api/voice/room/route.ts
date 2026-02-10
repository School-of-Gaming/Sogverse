import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDailyRoom, getDailyRoom } from "@/lib/daily";

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

    // 2. Role check — gedu only
    const { data: profileData } = await supabase
      .from("profiles")
      .select("role, display_name, username")
      .eq("id", user.id)
      .single();

    const profile = profileData as { role: string; display_name: string | null; username: string | null } | null;

    if (profile?.role !== "gedu") {
      return NextResponse.json(
        { error: "Only gedus can manage voice rooms" },
        { status: 403 }
      );
    }

    // 3. Parse optional name from body
    let roomName: string | undefined;
    try {
      const body = await request.json();
      roomName = body.name;
    } catch {
      // No body is fine — we'll use a default name
    }

    const admin = createAdminClient();
    const displayName = roomName || profile.display_name || profile.username || "Educator";
    const dailyRoomName = `gedu-${user.id.slice(0, 8)}`;

    // 4. Check if a voice_rooms row already exists for this gedu
    const { data: existing } = await admin
      .from("voice_rooms")
      .select("*")
      .eq("gedu_id", user.id)
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

    // 5. No row — create Daily.co room (if not already on Daily.co) + insert DB row
    const existingDaily = await getDailyRoom(dailyRoomName);
    if (!existingDaily) {
      await createDailyRoom({ name: dailyRoomName });
    }

    const { data: created, error: insertError } = await admin
      .from("voice_rooms")
      .insert({
        gedu_id: user.id,
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

export async function PATCH() {
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

    // 2. Role check — gedu only
    const { data: patchProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if ((patchProfile as { role: string } | null)?.role !== "gedu") {
      return NextResponse.json(
        { error: "Only gedus can manage voice rooms" },
        { status: 403 }
      );
    }

    // 3. Close the room
    const admin = createAdminClient();
    const { data: updated, error: updateError } = await admin
      .from("voice_rooms")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
      })
      .eq("gedu_id", user.id)
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
