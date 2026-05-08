import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMeetingToken, getDailyRoom, createDailyRoom, buildUserName } from "@/lib/daily";
import { computeSessionWindow, isEnrolledForSession } from "@/lib/session-schedule";
import { VOICE_CONFIG } from "@/lib/constants/voice";

export async function POST(request: Request) {
  try {
    const result = await requireRole(["gedu", "gamer", "admin"], {
      forbiddenMessage: "You do not have permission to join voice rooms",
    });
    if (result instanceof NextResponse) return result;
    const { user, profile } = result;

    const role = profile.role;

    // Parse body
    const body = await request.json();
    const { roomId } = body;

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 },
      );
    }

    // Fetch the room (using admin client to bypass RLS)
    const admin = createAdminClient();
    const { data: room, error: roomError } = await admin
      .from("voice_rooms")
      .select("*, product_groups(gedu_id, product_id, products(day_of_week, start_time, timezone, duration_minutes))")
      .eq("id", roomId)
      .single();

    if (roomError) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // --- Room type access control ---
    const roomType = room.room_type;

    if (roomType === "admin_only" && role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can join this room" },
        { status: 403 },
      );
    }

    if (roomType === "gedu_only" && role !== "admin" && role !== "gedu") {
      return NextResponse.json(
        { error: "Only educators and admins can join this room" },
        { status: 403 },
      );
    }

    // --- Group room membership checks ---
    let tokenExpUnix: number | undefined;
    let gamerEnrolledAt: Date | undefined;

    if (roomType === "group") {
      const group = room.product_groups;

      if (!group) {
        return NextResponse.json(
          { error: "Room group configuration is invalid" },
          { status: 500 },
        );
      }

      if (role === "gedu") {
        // Gedu must be the group's assigned educator
        if (group.gedu_id !== user.id) {
          return NextResponse.json(
            { error: "You are not assigned to this group" },
            { status: 403 },
          );
        }
      } else if (role === "gamer") {
        // Gamer must have an active enrollment
        const { data: enrollment } = await admin
          .from("group_enrollments")
          .select("id, created_at")
          .eq("group_id", room.group_id!)
          .eq("gamer_id", user.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (!enrollment) {
          return NextResponse.json(
            { error: "You are not enrolled in this group" },
            { status: 403 },
          );
        }

        gamerEnrolledAt = new Date(enrollment.created_at);
      }
      // Admin bypasses membership checks

      // --- Session window check (group rooms only, all roles) ---
      const schedule = group.products;
      const sessionWindow = computeSessionWindow(schedule);

      if (!sessionWindow.isOpen) {
        return NextResponse.json(
          { error: "Room is not open yet" },
          { status: 403 },
        );
      }

      // Gamer enrolled after the current session started — not paid for this session
      if (gamerEnrolledAt && !isEnrolledForSession(gamerEnrolledAt, sessionWindow.nextSessionStart)) {
        return NextResponse.json(
          { error: "Your enrollment starts next session" },
          { status: 403 },
        );
      }

      // Token expiry is the hard server-side ejection boundary. The client
      // also auto-leaves via computeSessionWindow(), but the grace period
      // ensures the client's 30s interval fires first for a clean UX.
      // See TOKEN_EXPIRY_GRACE_SECONDS for why this offset exists.
      tokenExpUnix = Math.round(sessionWindow.windowClosesAt.getTime() / 1000)
        + VOICE_CONFIG.TOKEN_EXPIRY_GRACE_SECONDS;
    }

    // --- Lazy Daily.co room creation ---
    const dailyRoom = await getDailyRoom(room.daily_room_name);
    if (!dailyRoom) {
      await createDailyRoom({ name: room.daily_room_name });
    }

    // Build token — encode userId|role|displayName via helper that
    // strips `|` from the display name so the client parser can't be spoofed.
    const userName = buildUserName({
      userId: user.id,
      role,
      displayName: profile.first_name,
    });
    const domain = process.env.NEXT_PUBLIC_DAILY_DOMAIN;
    if (!domain) {
      console.error("Missing NEXT_PUBLIC_DAILY_DOMAIN environment variable");
      return NextResponse.json(
        { error: "Voice chat is not configured" },
        { status: 500 },
      );
    }
    const roomUrl = `https://${domain}.daily.co/${room.daily_room_name}`;

    // Gamers are non-owners (no moderation, no screen share); admins/gedus are owners
    const isOwner = role !== "gamer";

    const token = await createMeetingToken({
      roomName: room.daily_room_name,
      isOwner,
      userName,
      expUnix: tokenExpUnix,
    });

    return NextResponse.json({ token, roomUrl, role });
  } catch (err) {
    console.error("Voice token error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
