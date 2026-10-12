import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildJoinCheckResponse,
  normalizeMinecraftUuid,
  type JoinCheckResponse,
} from "@/lib/minecraft/join-check";
import { loadJoinCheck } from "@/lib/minecraft/join-check.server";

/**
 * GET /api/minecraft/join-check?uuid=… — the gate every School of Gaming
 * Minecraft server asks when a player joins.
 *
 * A Minecraft account is let in when it is linked to a gamer holding a
 * qualifying seat; which seats qualify is decided by one predicate in
 * `src/lib/minecraft/join-check.ts`, and nowhere else. Every well-formed,
 * authenticated request answers 200 with `allowed`, a machine-readable
 * `reason`, an English `message` for the server's admin, and the linked gamers
 * with their active seats — a denial is an answer, not an error.
 *
 * The game server holds no user session, so the caller is authenticated by its
 * API key and the reads run on the service-role client. The error bodies are
 * read by the game server, so their wording is part of the contract.
 */
export async function GET(
  request: Request,
): Promise<NextResponse<JoinCheckResponse | { error: string }>> {
  // --- API key auth ---
  const apiKey = process.env.MINECRAFT_SERVER_API_KEY;
  if (!apiKey) {
    console.error("MINECRAFT_SERVER_API_KEY is not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header" },
      { status: 401 },
    );
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
    return NextResponse.json(
      { error: "uuid query parameter is required" },
      { status: 400 },
    );
  }

  // Dashed or undashed, either case: matched in the form it is stored in.
  const minecraftUuid = normalizeMinecraftUuid(rawUuid);
  if (!minecraftUuid) {
    return NextResponse.json(
      { error: "Invalid Minecraft UUID format" },
      { status: 400 },
    );
  }

  // --- Decide ---
  const lookup = await loadJoinCheck(createAdminClient(), minecraftUuid);
  if ("error" in lookup) {
    console.error("Minecraft join check lookup failed:", lookup.error);
    return NextResponse.json(
      { error: "Failed to check access" },
      { status: 500 },
    );
  }

  return NextResponse.json(buildJoinCheckResponse(lookup.data, new Date()));
}
