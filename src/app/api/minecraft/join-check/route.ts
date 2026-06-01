import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** Normalize a Minecraft UUID to dashed 8-4-4-4-12 form. */
function normalizeMcUuid(raw: string): string | null {
  const hex = raw.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase();
}

export async function GET(request: Request) {
  try {
    // --- API key auth ---
    const apiKey = process.env.MINECRAFT_SERVER_API_KEY;
    if (!apiKey) {
      console.error("MINECRAFT_SERVER_API_KEY is not configured");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
    }

    const token = authHeader.slice("Bearer ".length);
    const tokenBuf = Buffer.from(token);
    const keyBuf = Buffer.from(apiKey);
    if (tokenBuf.length !== keyBuf.length || !timingSafeEqual(tokenBuf, keyBuf)) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    // --- Validate UUID param ---
    const { searchParams } = new URL(request.url);
    const rawUuid = searchParams.get("uuid");
    if (!rawUuid) {
      return NextResponse.json({ error: "uuid query parameter is required" }, { status: 400 });
    }

    const uuid = normalizeMcUuid(rawUuid);
    if (!uuid) {
      return NextResponse.json({ error: "Invalid Minecraft UUID format" }, { status: 400 });
    }

    // --- Look up player ---
    const admin = createAdminClient();

    const { data: account, error: accountError } = await admin
      .from("minecraft_accounts")
      .select("user_id, profiles(id, first_name, role)")
      .eq("minecraft_uuid", uuid)
      .maybeSingle();

    if (accountError) {
      console.error("join-check: DB error looking up player:", accountError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (!account) {
      return NextResponse.json({ error: "Unknown Minecraft player" }, { status: 404 });
    }

    const profile = account.profiles;
    const role = profile.role;
    const firstName = profile.first_name;

    // --- Session access (gedu / gamer): pending migration to the current
    //     product system. ---
    //
    // The original gating queried the legacy v1 product / product_groups /
    // group_enrollments tables, which have been dropped. It must be rebuilt
    // against the current schema before this endpoint can authorize access:
    //   * gamer → an active participations_v2 row on a product whose session
    //             window (schedule_slots_v2 + subscribed holiday calendars) is
    //             open right now, and only if the participation covers it.
    //   * gedu  → a gedu_group_assignments_v2 row on such a product.
    // The window math currently lives in @/lib/session-schedule, but it's
    // shaped for the v1 single-slot product (day_of_week/start_time); v2 has
    // multiple schedule_slots_v2 per product, so that helper needs reworking
    // too. This endpoint was never wired in production, so it fails closed.
    // 501 lets a future caller distinguish "not implemented" from "denied".
    if (role === "gedu" || role === "gamer") {
      return NextResponse.json(
        {
          error:
            "Minecraft session access is pending migration to the current product system",
          role,
          firstName,
        },
        { status: 501 },
      );
    }

    // Other roles (admin, customer) — no session-gated access
    return NextResponse.json({
      allowed: false,
      role,
      firstName,
      reason: "No active session",
    });
  } catch (err) {
    console.error("join-check error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
