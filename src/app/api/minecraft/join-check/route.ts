import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeSessionWindow, isEnrolledForSession } from "@/lib/voice-schedule";

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
      .select("user_id, profiles(id, display_name, role)")
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
    const displayName = profile.display_name;

    // --- Check session access ---
    if (role === "gedu") {
      return await checkGeduSession(admin, profile.id, displayName);
    }

    if (role === "gamer") {
      return await checkGamerSession(admin, profile.id, displayName);
    }

    // Other roles (admin, customer) — no session-gated access
    return NextResponse.json({
      allowed: false,
      role,
      displayName,
      reason: "No active session",
    });
  } catch (err) {
    console.error("join-check error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function checkGeduSession(admin: AdminClient, userId: string, displayName: string) {
  const { data: groups, error } = await admin
    .from("product_groups")
    .select("id, products(name, day_of_week, start_time, timezone, duration_minutes)")
    .eq("gedu_id", userId);

  if (error) {
    console.error("join-check: DB error fetching gedu groups:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (groups.length === 0) {
    return NextResponse.json({
      allowed: false,
      role: "gedu",
      displayName,
      reason: "No active session",
    });
  }

  for (const group of groups) {
    const product = group.products;

    const window = computeSessionWindow(product);
    if (window.isOpen) {
      return NextResponse.json({
        allowed: true,
        role: "gedu",
        displayName,
        endTime: window.windowClosesAt.toISOString(),
        reason: `${product.name} with ${displayName}`,
      });
    }
  }

  return NextResponse.json({
    allowed: false,
    role: "gedu",
    displayName,
    reason: "No active session",
  });
}

async function checkGamerSession(admin: AdminClient, userId: string, displayName: string) {
  const { data: enrollments, error } = await admin
    .from("group_enrollments")
    .select(`
      created_at,
      product_groups(
        gedu_id,
        products(name, day_of_week, start_time, timezone, duration_minutes),
        profiles(display_name)
      )
    `)
    .eq("gamer_id", userId)
    .eq("status", "active");

  if (error) {
    console.error("join-check: DB error fetching gamer enrollments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (enrollments.length === 0) {
    return NextResponse.json({
      allowed: false,
      role: "gamer",
      displayName,
      reason: "No active session",
    });
  }

  for (const enrollment of enrollments) {
    const group = enrollment.product_groups;
    const product = group.products;

    const window = computeSessionWindow(product);
    if (!window.isOpen) continue;

    // Skip if gamer enrolled after the session started (not paid for this session)
    const enrolledAt = new Date(enrollment.created_at);
    if (!isEnrolledForSession(enrolledAt, window.nextSessionStart)) continue;

    const geduName = group.profiles.display_name;

    return NextResponse.json({
      allowed: true,
      role: "gamer",
      displayName,
      endTime: window.windowClosesAt.toISOString(),
      reason: `${product.name} with ${geduName}`,
    });
  }

  return NextResponse.json({
    allowed: false,
    role: "gamer",
    displayName,
    reason: "No active session",
  });
}
