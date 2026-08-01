import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * GET /api/minecraft/join-check — asks whether a Minecraft player may be on the
 * server right now. Not implemented: it authenticates the caller, validates the
 * UUID, and then answers 501 to every well-formed request.
 *
 * The original gating queried the legacy product / product_groups /
 * group_enrollments tables, which have been dropped, so it has not been able to
 * authorize anyone since — and it was never wired in production. What remains
 * is the shell: the API-key check and the UUID format check, so the URL, its
 * auth contract, and the public docs page describing it stay live while the
 * gating is rebuilt.
 *
 * **When rebuilding, this is an entitlement question, not an identity one.**
 * `minecraft_accounts.minecraft_uuid` is not unique: two Sogverse accounts may
 * link the same Minecraft account (siblings share them), so a lookup by UUID
 * returns a set of rows, not one. Ask "does anyone holding this UUID have
 * access right now?" and allow if any of them qualifies — a single-row read
 * breaks the moment a shared account appears. Nothing can tell the server
 * *which* sibling is at the keyboard; a feature needing that needs its own
 * mechanism, not a database constraint. Full spec in TODO.md.
 */
export function GET(request: Request) {
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

  if (!/^[0-9a-f]{32}$/i.test(rawUuid.replace(/-/g, ""))) {
    return NextResponse.json(
      { error: "Invalid Minecraft UUID format" },
      { status: 400 },
    );
  }

  // 501, not a denial: the caller has to be able to tell "Sogverse cannot answer
  // this yet" from "this player is not allowed on", and fail closed without
  // concluding the player was rejected.
  return NextResponse.json(
    {
      error:
        "Minecraft session access is pending migration to the current product system",
    },
    { status: 501 },
  );
}
