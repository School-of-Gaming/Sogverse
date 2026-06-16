import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildUserName,
  createMeetingToken,
  getOrCreateDailyRoom,
  lockedVoiceRoomName,
} from "@/lib/daily";
import { computeSessionWindow } from "@/lib/session-schedule";
import { VOICE_CONFIG } from "@/lib/constants/voice";

/**
 * Mint a Daily.co meeting token for a **locked** (private/disciplinary) voice
 * zone — a separate Daily room from the group's main room, so the audio data
 * never reaches non-members (true isolation, not client-side muting).
 *
 * Request body: `{ groupId, zoneId }`.
 *
 * This endpoint is the security boundary that makes "can't self-enter / can't
 * reload to escape" real, independent of any client behavior (see
 * src/components/voice/CLAUDE.md). On top of the same group/remoteness/window
 * gates as the main token route, it adds the **locked gate**:
 *   - a moderator (admin, or gedu assigned to the product) may enter/leave the
 *     locked room freely — it's their tool;
 *   - a gamer may join **only** if a `voice_locked_placements` row matches
 *     `(zone_id, gamer_id, session_opens_at = current window open)`. A gamer
 *     with no matching placement gets 403. Because placements are mod-only
 *     writes (RLS), a gamer can neither place themselves nor reload to escape.
 *
 * The matching `session_opens_at` is load-bearing: a placement from a prior
 * week's session has a different open time, so it doesn't grant access to this
 * week's locked room.
 */
export async function POST(request: Request) {
  try {
    const result = await requireRole(["gedu", "gamer", "admin"], {
      forbiddenMessage: "You do not have permission to join voice rooms",
    });
    if (result instanceof NextResponse) return result;
    const { user, profile } = result;
    const role = profile.role;

    const body = await parseJsonBody(
      request,
      z.object({
        groupId: z.string().min(1, "groupId is required"),
        zoneId: z.string().min(1, "zoneId is required"),
      }),
    );
    if (body instanceof NextResponse) return body;
    const { groupId, zoneId } = body;

    const admin = createAdminClient();

    // Group → product → slots → timezone (same shape as the main token route).
    const { data: group, error: groupErr } = await admin
      .from("product_groups")
      .select(
        `
          id, product_id,
          product:products!inner(
            id, timezone, is_remote,
            slots:schedule_slots(weekday, start_time, duration_minutes)
          )
        `,
      )
      .eq("id", groupId)
      .maybeSingle();

    if (groupErr || !group) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    if (!group.product.is_remote) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // The zone must exist, be a locked zone, and belong to this group.
    const { data: zone } = await admin
      .from("voice_zones")
      .select("id, is_locked, group_id")
      .eq("id", zoneId)
      .eq("group_id", groupId)
      .eq("is_locked", true)
      .maybeSingle();

    if (!zone) {
      return NextResponse.json({ error: "Locked zone not found" }, { status: 404 });
    }

    // ---- Session window gate (first open slot drives the room name + exp) ----
    const now = new Date();
    let openSlot: { windowOpensAt: Date; windowClosesAt: Date } | null = null;
    for (const slot of group.product.slots) {
      const window = computeSessionWindow(
        {
          day_of_week: slot.weekday,
          start_time: slot.start_time,
          timezone: group.product.timezone,
          duration_minutes: slot.duration_minutes,
        },
        now,
      );
      if (window.isOpen) {
        openSlot = {
          windowOpensAt: window.windowOpensAt,
          windowClosesAt: window.windowClosesAt,
        };
        break;
      }
    }
    if (!openSlot) {
      return NextResponse.json({ error: "Room is not open yet" }, { status: 403 });
    }

    // ---- Locked gate ----
    if (role === "gamer") {
      // A gamer needs a placement row for THIS zone and THIS session window.
      const { data: placement } = await admin
        .from("voice_locked_placements")
        .select("zone_id, session_opens_at")
        .eq("group_id", groupId)
        .eq("gamer_id", user.id)
        .maybeSingle();

      const placedHere =
        !!placement &&
        placement.zone_id === zoneId &&
        new Date(placement.session_opens_at).getTime() ===
          openSlot.windowOpensAt.getTime();

      if (!placedHere) {
        return NextResponse.json(
          { error: "You are not placed in this zone" },
          { status: 403 },
        );
      }
    } else if (role === "gedu") {
      // Moderators enter/leave freely; a gedu must be assigned to the product.
      const { data: assignment } = await admin
        .from("gedu_group_assignments")
        .select("group_id")
        .eq("gedu_id", user.id)
        .eq("product_id", group.product_id)
        .limit(1)
        .maybeSingle();

      if (!assignment) {
        return NextResponse.json(
          { error: "You are not assigned to this group" },
          { status: 403 },
        );
      }
    }
    // admin passes through.

    // ---- Daily room: get-or-create the locked room ----
    const dailyRoomName = lockedVoiceRoomName({
      groupId,
      windowOpensAt: openSlot.windowOpensAt,
      timezone: group.product.timezone,
      zoneId,
    });

    const expUnix =
      Math.round(openSlot.windowClosesAt.getTime() / 1000) +
      VOICE_CONFIG.TOKEN_EXPIRY_GRACE_SECONDS;

    await getOrCreateDailyRoom({ name: dailyRoomName, expUnix });

    const domain = process.env.NEXT_PUBLIC_DAILY_DOMAIN;
    if (!domain) {
      console.error("Missing NEXT_PUBLIC_DAILY_DOMAIN environment variable");
      return NextResponse.json(
        { error: "Voice chat is not configured" },
        { status: 500 },
      );
    }

    const { data: minecraft } = await admin
      .from("minecraft_accounts")
      .select("minecraft_username, minecraft_uuid")
      .eq("user_id", user.id)
      .maybeSingle();

    const userName = buildUserName({
      userId: user.id,
      role,
      displayName: profile.first_name,
      minecraftUsername: minecraft?.minecraft_username ?? null,
      minecraftUuid: minecraft?.minecraft_uuid ?? null,
    });
    const roomUrl = `https://${domain}.daily.co/${dailyRoomName}`;
    const isOwner = role !== "gamer";

    const token = await createMeetingToken({
      roomName: dailyRoomName,
      isOwner,
      userName,
      expUnix,
    });

    return NextResponse.json({ token, roomUrl, role });
  } catch (err) {
    console.error("Voice locked token error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
