import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { PIN_COOKIE_NAME, pinCookieOptions, pinTokenFor } from "@/lib/pin-session";

const schema = z.object({ pin: z.string().regex(/^\d{4}$/) });

/**
 * Verify the parent PIN and unlock the session. allowUnverified: this is the
 * route a locked customer calls to BECOME unlocked, so it must not be gated.
 */
export async function POST(request: Request) {
  const auth = await requireRole("customer", { allowUnverified: true });
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 400 });
  }

  const { data: ok, error } = await supabase.rpc("verify_my_pin", { p_pin: parsed.data.pin });
  if (error) {
    console.error("pin/verify: verify_my_pin failed", error);
    return NextResponse.json({ error: "Failed to verify PIN" }, { status: 500 });
  }
  // A wrong PIN is a normal outcome, not an auth failure (the session is valid —
  // requireRole already passed), so it's a 200 with verified:false rather than a
  // 401. That keeps an expected wrong guess out of the browser's error console
  // and out of network-error monitoring; a real 401 then means the session
  // itself failed.
  if (!ok) {
    return NextResponse.json({ verified: false });
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const sessionId = claimsData?.claims.session_id;
  if (!sessionId) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const token = await pinTokenFor(user.id, sessionId);
  (await cookies()).set(PIN_COOKIE_NAME, token, pinCookieOptions());

  return NextResponse.json({ verified: true });
}
