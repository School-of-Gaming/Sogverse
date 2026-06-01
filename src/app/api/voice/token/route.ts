import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildUserName,
  createMeetingToken,
  getOrCreateDailyRoom,
  groupVoiceRoomName,
} from "@/lib/daily";
import { computeSessionWindow } from "@/lib/session-schedule";
import { VOICE_CONFIG } from "@/lib/constants/voice";

/**
 * Mint a Daily.co meeting token for a v2 product group's voice room.
 *
 * Request body: `{ groupId: product_groups_v2.id }`.
 *
 * There is no backing `voice_rooms_v2` table — Daily.co is the single
 * source of truth for room existence. We derive a deterministic room name
 * from the group + the current session window, get-or-create on demand,
 * and set Daily's `exp` to the session-window close so the platform reaps
 * the room (and ejects late joiners) once the window passes.
 *
 * Gates:
 *   1. Membership — gamers via `participations_v2.status = 'active'`, gedus
 *      via `gedu_group_assignments_v2` on the product (per redesign §4.10's
 *      cross-group voice mobility rule), admins pass through.
 *   2. Session window — at least one slot's window must be open right now.
 *
 * Notably absent: there is no "did you enroll before this session started?"
 * gate. v2 treats active membership as the binary access predicate — if
 * you're an active participant, you're in. (v1 had a mid-session enrollment
 * cut-off that was load-bearing for the sorg-token billing model; v2's
 * credit-based billing makes the cut-off irrelevant.)
 */
export async function POST(request: Request) {
  try {
    const result = await requireRole(["gedu", "gamer", "admin"], {
      forbiddenMessage: "You do not have permission to join voice rooms",
    });
    if (result instanceof NextResponse) return result;
    const { user, profile } = result;
    const role = profile.role;

    const body = (await request.json()) as { groupId?: string };
    const { groupId } = body;

    if (!groupId) {
      return NextResponse.json(
        { error: "groupId is required" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Group → product → slots → timezone in one round trip. `!inner` is
    // important: it makes PostgREST fail the parent select on a missing
    // product (shouldn't happen given the FK, but defends against partially
    // deleted rows). schedule_slots_v2 is keyed off `product_id`, so it
    // nests inside the products_v2 join — `product_groups_v2 ↔
    // schedule_slots_v2` is not a direct FK pair.
    const { data: group, error: groupErr } = await admin
      .from("product_groups_v2")
      .select(
        `
          id, product_id,
          product:products_v2!inner(
            id, timezone, is_remote,
            slots:schedule_slots_v2(weekday, start_time, duration_minutes)
          )
        `,
      )
      .eq("id", groupId)
      .maybeSingle();

    if (groupErr || !group) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (!group.product.is_remote) {
      // In-person products have no voice room. 404 (not 403) matches the
      // dashboard's "no destination" stance — the URL shape isn't a valid
      // voice room.
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const productTimezone = group.product.timezone;
    const slots = group.product.slots;

    // ---- Membership gate ----
    if (role === "gamer") {
      const { data: participation } = await admin
        .from("participations_v2")
        .select("id")
        .eq("group_id", groupId)
        .eq("gamer_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (!participation) {
        return NextResponse.json(
          { error: "You are not enrolled in this group" },
          { status: 403 },
        );
      }
    } else if (role === "gedu") {
      // Per redesign §4.10, the gedu assignment predicate is on
      // `product_id` (cross-group voice mobility), not `group_id`.
      const { data: assignment } = await admin
        .from("gedu_group_assignments_v2")
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

    // ---- Session window gate ----
    // Iterate every slot; the first whose window is currently open wins.
    // Mon-11pm + Tue-5am sessions for the same group sit on different slots
    // (and end up with distinct Daily room names below), so checking each
    // slot independently is correct.
    const now = new Date();
    let openSlot: {
      windowOpensAt: Date;
      windowClosesAt: Date;
    } | null = null;
    for (const slot of slots) {
      const window = computeSessionWindow(
        {
          day_of_week: slot.weekday,
          start_time: slot.start_time,
          timezone: productTimezone,
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
      return NextResponse.json(
        { error: "Room is not open yet" },
        { status: 403 },
      );
    }

    // ---- Daily room: get-or-create ----
    // The room name is content-addressable from (group, window open time),
    // so every joiner derives the same name independently and the helper
    // either returns the existing room or creates it. No race-on-first-join
    // surfaces as a user-visible error — the duplicate-name path falls
    // through silently inside the helper.
    const dailyRoomName = groupVoiceRoomName({
      groupId,
      windowOpensAt: openSlot.windowOpensAt,
      timezone: productTimezone,
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

    // The joiner's own Minecraft identity rides along in the Daily token so
    // peers can render the badge without a DB lookup — `minecraft_accounts`
    // RLS forbids reading another user's row, so per-participant client
    // fetches aren't possible. We read the joiner's own row (always passing
    // the slots, even when there's no row, so the client shows "(Unknown)"
    // rather than no badge for gamers/gedus).
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
    console.error("Voice token error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
