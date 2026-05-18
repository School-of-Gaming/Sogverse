import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildUserName,
  createDailyRoom,
  createMeetingToken,
  DailyApiError,
  getDailyRoom,
} from "@/lib/daily";
import { computeSessionWindow, isEnrolledForSession } from "@/lib/session-schedule";
import { VOICE_CONFIG } from "@/lib/constants/voice";

/**
 * Mint a Daily.co meeting token for a voice room.
 *
 * Accepts two request shapes:
 *
 *   1. v1 `{ roomId }` — looks up a `voice_rooms` row, gates by room_type
 *      (admin_only / gedu_only / group), checks group enrollment + the
 *      session window, lazy-creates the Daily room. v1 product groups
 *      continue to ride this branch unchanged.
 *
 *   2. v2 `{ groupId }` — keyed off `product_groups_v2.id`. No backing
 *      `voice_rooms_v2` table — Daily.co is the single source of truth for
 *      room existence; we lazy-create on first join, set the room's `exp`
 *      to the session-window close so Daily reaps it. Gates: membership
 *      via `participations_v2` (gamer) / `gedu_group_assignments_v2`
 *      (gedu) / pass-through (admin), then the slot's session window, then
 *      the gamer mid-session enrollment cut-off.
 *
 * Response shape is identical between branches — `{ token, roomUrl, role }`
 * — so `VoiceSessionPage` doesn't branch on which path produced the token.
 */
export async function POST(request: Request) {
  try {
    const result = await requireRole(["gedu", "gamer", "admin"], {
      forbiddenMessage: "You do not have permission to join voice rooms",
    });
    if (result instanceof NextResponse) return result;
    const { user, profile } = result;
    // `requireRole` already filtered to {gedu, gamer, admin}; the profile
    // type widens via the table row so narrow back for the helper handlers.
    if (profile.role === "customer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const role = profile.role;

    const body = (await request.json()) as { roomId?: string; groupId?: string };
    const { roomId, groupId } = body;

    // `await` is load-bearing: the helpers can reject (e.g. a non-409
    // Daily error) and the outer try/catch only catches awaited promises.
    if (groupId) {
      return await handleV2(groupId, user, profile, role);
    }
    if (roomId) {
      return await handleV1(roomId, user, profile, role);
    }
    return NextResponse.json(
      { error: "roomId is required" },
      { status: 400 },
    );
  } catch (err) {
    console.error("Voice token error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// v1 branch — `voice_rooms` row lookup, unchanged from the original handler.
// ---------------------------------------------------------------------------
async function handleV1(
  roomId: string,
  user: { id: string },
  profile: { first_name: string | null },
  role: "gedu" | "gamer" | "admin",
) {
  const admin = createAdminClient();
  const { data: room, error: roomError } = await admin
    .from("voice_rooms")
    .select(
      "*, product_groups(gedu_id, product_id, products(day_of_week, start_time, timezone, duration_minutes))",
    )
    .eq("id", roomId)
    .single();

  if (roomError) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

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
      if (group.gedu_id !== user.id) {
        return NextResponse.json(
          { error: "You are not assigned to this group" },
          { status: 403 },
        );
      }
    } else if (role === "gamer") {
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

    const schedule = group.products;
    const sessionWindow = computeSessionWindow(schedule);

    if (!sessionWindow.isOpen) {
      return NextResponse.json(
        { error: "Room is not open yet" },
        { status: 403 },
      );
    }

    if (gamerEnrolledAt && !isEnrolledForSession(gamerEnrolledAt, sessionWindow.nextSessionStart)) {
      return NextResponse.json(
        { error: "Your enrollment starts next session" },
        { status: 403 },
      );
    }

    tokenExpUnix =
      Math.round(sessionWindow.windowClosesAt.getTime() / 1000) +
      VOICE_CONFIG.TOKEN_EXPIRY_GRACE_SECONDS;
  }

  const dailyRoom = await getDailyRoom(room.daily_room_name);
  if (!dailyRoom) {
    await createDailyRoom({ name: room.daily_room_name });
  }

  return mintAndRespond({
    user,
    profile,
    role,
    dailyRoomName: room.daily_room_name,
    expUnix: tokenExpUnix,
  });
}

// ---------------------------------------------------------------------------
// v2 branch — `product_groups_v2.id` lookup, no backing table.
// ---------------------------------------------------------------------------
async function handleV2(
  groupId: string,
  user: { id: string },
  profile: { first_name: string | null },
  role: "gedu" | "gamer" | "admin",
) {
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
    // In-person products have no voice room. Treating this as 404
    // rather than 403 matches the dashboard's "no destination" stance
    // — the URL shape isn't actually a valid voice room.
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const productTimezone = group.product.timezone;
  const slots = group.product.slots;

  // ---- Membership gate ----
  let gamerSignedUpAt: Date | undefined;
  if (role === "gamer") {
    const { data: participation } = await admin
      .from("participations_v2")
      .select("id, signed_up_at")
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
    gamerSignedUpAt = new Date(participation.signed_up_at);
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
    weekday: number;
    start_time: string;
    duration_minutes: number;
    windowOpensAt: Date;
    windowClosesAt: Date;
    nextSessionStart: Date;
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
        weekday: slot.weekday,
        start_time: slot.start_time,
        duration_minutes: slot.duration_minutes,
        windowOpensAt: window.windowOpensAt,
        windowClosesAt: window.windowClosesAt,
        nextSessionStart: window.nextSessionStart,
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

  // ---- Mid-session enrollment gate (gamers only) ----
  if (
    gamerSignedUpAt &&
    !isEnrolledForSession(gamerSignedUpAt, openSlot.nextSessionStart)
  ) {
    return NextResponse.json(
      { error: "Your enrollment starts next session" },
      { status: 403 },
    );
  }

  // ---- TODO: participation_access_state hook (redesign §4.5d) ----
  // When that function lands, call it here with `participation.id` and
  // branch on the return: 'allowed' continues, 'grace_blocked' / 'expired'
  // → 403 with a billing-state-aware message. Until then, enrollment-only
  // (above) is the rule.

  // ---- Daily room name + lazy create ----
  // Different sessions of the same group get distinct names so two slots
  // in the same week never collide. Wall-clock formatting in the product
  // timezone keeps the wall-clock identity stable across DST.
  const windowToken = formatInTimeZone(
    openSlot.windowOpensAt,
    productTimezone,
    "yyyyMMddHHmm",
  );
  const dailyRoomName = `g-${groupId.slice(0, 8)}-${windowToken}`;

  const expUnix =
    Math.round(openSlot.windowClosesAt.getTime() / 1000) +
    VOICE_CONFIG.TOKEN_EXPIRY_GRACE_SECONDS;

  try {
    await createDailyRoom({ name: dailyRoomName, expUnix });
  } catch (err) {
    // 409 means the room already exists — another client got there first.
    // Same swallow pattern instant rooms use for code collisions.
    if (!(err instanceof DailyApiError) || err.status !== 409) {
      throw err;
    }
  }

  return mintAndRespond({
    user,
    profile,
    role,
    dailyRoomName,
    expUnix,
  });
}

// ---------------------------------------------------------------------------
// Shared response — buildUserName, createMeetingToken, roomUrl assembly.
// ---------------------------------------------------------------------------
async function mintAndRespond(args: {
  user: { id: string };
  profile: { first_name: string | null };
  role: "gedu" | "gamer" | "admin";
  dailyRoomName: string;
  expUnix: number | undefined;
}) {
  const { user, profile, role, dailyRoomName, expUnix } = args;

  const domain = process.env.NEXT_PUBLIC_DAILY_DOMAIN;
  if (!domain) {
    console.error("Missing NEXT_PUBLIC_DAILY_DOMAIN environment variable");
    return NextResponse.json(
      { error: "Voice chat is not configured" },
      { status: 500 },
    );
  }

  const userName = buildUserName({
    userId: user.id,
    role,
    displayName: profile.first_name ?? "",
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
}
